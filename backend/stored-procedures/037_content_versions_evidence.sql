DELIMITER $$
DROP PROCEDURE IF EXISTS sp_content_owner$$
CREATE PROCEDURE sp_content_owner(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36))
SQL SECURITY INVOKER
BEGIN
 CALL sp_workspace_assert(p_actor,'CREATOR',p_campaign);
 IF NOT EXISTS(SELECT 1 FROM content_submissions cs JOIN campaign_creator_allocations x ON x.application_id=cs.application_id JOIN campaign_applications a ON a.id=x.application_id JOIN creators cr ON cr.id=x.creator_id WHERE cs.id=p_submission AND cs.campaign_id=p_campaign AND x.campaign_id=p_campaign AND a.campaign_id=p_campaign AND a.creator_id=x.creator_id AND cr.user_id=p_actor AND a.status='APPROVED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NOT_FOUND';END IF;
END$$
DROP PROCEDURE IF EXISTS sp_content_write_guard$$
CREATE PROCEDURE sp_content_write_guard(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_expected INT,OUT p_current INT)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_campaign VARCHAR(32);DECLARE v_status VARCHAR(24);
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_content_owner(p_actor,p_campaign,p_submission);
 SELECT status INTO v_campaign FROM campaigns WHERE id=p_campaign FOR UPDATE;
 SELECT version,status INTO p_current,v_status FROM content_submissions WHERE id=p_submission FOR UPDATE;
 IF p_expected IS NULL OR p_expected<>p_current THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_CONFLICT';END IF;
 IF v_status<>'SUBMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_LOCKED';END IF;
 IF p_current>=50 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_VERSION_LIMIT';END IF;
 IF NOT EXISTS(SELECT 1 FROM content_submission_windows WHERE id=p_campaign) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_WINDOW_CLOSED';END IF;
END$$
DROP PROCEDURE IF EXISTS sp_content_snapshot$$
CREATE PROCEDURE sp_content_snapshot(IN p_actor CHAR(36),IN p_submission CHAR(36),IN p_kind VARCHAR(24),IN p_reason VARCHAR(500))
SQL SECURITY INVOKER
BEGIN
 IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>500 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_CHANGE_INVALID';END IF;
 INSERT INTO content_submission_versions(submission_id,version,content_url,caption,published_at,notes,status,change_type,reason,actor_user_id)
 SELECT id,version,content_url,caption,published_at,notes,status,p_kind,TRIM(p_reason),p_actor FROM content_submissions WHERE id=p_submission;
END$$
DROP PROCEDURE IF EXISTS sp_content_history$$
CREATE PROCEDURE sp_content_history(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_version INT;
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_content_owner(p_actor,p_campaign,p_submission);
 SELECT COALESCE(p_version,version) INTO v_version FROM content_submissions WHERE id=p_submission;
 IF NOT EXISTS(SELECT 1 FROM content_submission_versions WHERE submission_id=p_submission AND version=v_version) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NOT_FOUND';END IF;
 SELECT cs.id,cs.version,cs.status,cs.unit_number AS unitNumber,p.name AS platformName,t.name AS contentTypeName,
 (cs.status='SUBMITTED' AND cs.version<50 AND EXISTS(SELECT 1 FROM content_submission_windows w WHERE w.id=p_campaign)) AS canEdit,
 (SELECT COALESCE(SUM(byte_size),0) FROM content_evidence_blobs b WHERE b.submission_id=cs.id) AS retainedBytes
 FROM content_submissions cs JOIN platforms p ON p.id=cs.platform_id JOIN content_types t ON t.id=cs.content_type_id WHERE cs.id=p_submission;
 SELECT version,change_type AS changeType,reason,created_at AS createdAt FROM content_submission_versions WHERE submission_id=p_submission ORDER BY version DESC LIMIT 50;
 SELECT version,content_url AS contentUrl,caption,published_at AS publishedAt,notes,status,change_type AS changeType,reason,created_at AS createdAt FROM content_submission_versions WHERE submission_id=p_submission AND version=v_version;
 SELECT b.id,b.title,b.mime_type AS mimeType,b.byte_size AS byteSize,b.page_count AS pageCount FROM content_version_evidence x JOIN content_evidence_blobs b ON b.id=x.evidence_id AND b.submission_id=x.submission_id WHERE x.submission_id=p_submission AND x.version=v_version ORDER BY b.created_at,b.id;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_edit_content$$
CREATE PROCEDURE sp_edit_content(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT,IN p_url VARCHAR(2048),IN p_caption TEXT,IN p_published DATETIME(3),IN p_notes TEXT,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_current INT;DECLARE v_start DATETIME(3);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 CALL sp_content_write_guard(p_actor,p_campaign,p_submission,p_version,v_current);
 SELECT start_at INTO v_start FROM content_submission_windows WHERE id=p_campaign;
 IF p_url IS NULL OR CHAR_LENGTH(p_url)<10 OR CHAR_LENGTH(p_url)>2048 OR p_url NOT LIKE 'https://%' OR p_caption IS NULL OR CHAR_LENGTH(TRIM(p_caption))<1 OR CHAR_LENGTH(p_caption)>5000 OR p_notes IS NULL OR CHAR_LENGTH(p_notes)>2000 OR p_published IS NULL OR p_published<v_start OR p_published>UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM content_submissions WHERE id=p_submission AND content_url=p_url AND BINARY caption=BINARY TRIM(p_caption) AND published_at=p_published AND BINARY notes=BINARY TRIM(p_notes)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NO_CHANGE';END IF;
 UPDATE content_submissions SET content_url=p_url,caption=TRIM(p_caption),published_at=p_published,notes=TRIM(p_notes),version=version+1 WHERE id=p_submission;
 CALL sp_content_snapshot(p_actor,p_submission,'EDIT',p_reason);
 INSERT INTO content_version_evidence(submission_id,version,evidence_id) SELECT submission_id,v_current+1,evidence_id FROM content_version_evidence WHERE submission_id=p_submission AND version=v_current;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CONTENT_VERSION_SAVED','content_submissions',p_submission,p_request,JSON_OBJECT('campaignId',p_campaign,'version',v_current+1,'changeType','EDIT'));
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_change_content_evidence$$
CREATE PROCEDURE sp_change_content_evidence(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT,IN p_action VARCHAR(24),IN p_file CHAR(36),IN p_title VARCHAR(120),IN p_bytes MEDIUMBLOB,IN p_mime VARCHAR(40),IN p_hash CHAR(64),IN p_width INT,IN p_height INT,IN p_pages INT,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_current INT;DECLARE v_count INT;DECLARE v_bytes BIGINT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 CALL sp_content_write_guard(p_actor,p_campaign,p_submission,p_version,v_current);
 IF p_action IS NULL OR p_action NOT IN ('ADD_EVIDENCE','REMOVE_EVIDENCE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_CHANGE_INVALID';END IF;
 IF p_action='ADD_EVIDENCE' THEN
  IF p_title IS NULL OR CHAR_LENGTH(TRIM(p_title))<2 OR CHAR_LENGTH(p_title)>120 OR p_bytes IS NULL OR OCTET_LENGTH(p_bytes)<1 OR OCTET_LENGTH(p_bytes)>5242880 OR p_mime NOT IN ('application/pdf','image/webp') OR p_mime IS NULL OR p_hash IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_CHANGE_INVALID';END IF;
  SELECT COUNT(*) INTO v_count FROM content_version_evidence WHERE submission_id=p_submission AND version=v_current;
  SELECT COALESCE(SUM(byte_size),0) INTO v_bytes FROM content_evidence_blobs WHERE submission_id=p_submission;
  IF v_count>=5 OR v_bytes+OCTET_LENGTH(p_bytes)>26214400 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_EVIDENCE_LIMIT';END IF;
  IF EXISTS(SELECT 1 FROM content_version_evidence x JOIN content_evidence_blobs b ON b.id=x.evidence_id WHERE x.submission_id=p_submission AND x.version=v_current AND b.content_hash=p_hash) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_EVIDENCE_DUPLICATE';END IF;
  INSERT INTO content_evidence_blobs(id,submission_id,title,file_content,mime_type,content_hash,byte_size,width,height,page_count) VALUES(p_file,p_submission,TRIM(p_title),p_bytes,p_mime,p_hash,OCTET_LENGTH(p_bytes),p_width,p_height,p_pages);
 ELSE
  IF NOT EXISTS(SELECT 1 FROM content_version_evidence WHERE submission_id=p_submission AND version=v_current AND evidence_id=p_file) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NOT_FOUND';END IF;
 END IF;
 UPDATE content_submissions SET version=version+1 WHERE id=p_submission;
 CALL sp_content_snapshot(p_actor,p_submission,p_action,p_reason);
 INSERT INTO content_version_evidence(submission_id,version,evidence_id) SELECT submission_id,v_current+1,evidence_id FROM content_version_evidence WHERE submission_id=p_submission AND version=v_current AND (p_action='ADD_EVIDENCE' OR evidence_id<>p_file);
 IF p_action='ADD_EVIDENCE' THEN INSERT INTO content_version_evidence(submission_id,version,evidence_id) VALUES(p_submission,v_current+1,p_file);END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CONTENT_VERSION_SAVED','content_submissions',p_submission,p_request,JSON_OBJECT('campaignId',p_campaign,'version',v_current+1,'changeType',p_action,'evidenceId',p_file));
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_content_evidence_file$$
CREATE PROCEDURE sp_content_evidence_file(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT,IN p_file CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_content_owner(p_actor,p_campaign,p_submission);
 IF NOT EXISTS(SELECT 1 FROM content_version_evidence WHERE submission_id=p_submission AND version=p_version AND evidence_id=p_file) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NOT_FOUND';END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CONTENT_EVIDENCE_READ','content_submissions',p_submission,p_request,JSON_OBJECT('campaignId',p_campaign,'version',p_version,'evidenceId',p_file));
 SELECT id,mime_type AS mimeType,file_content AS fileContent FROM content_evidence_blobs WHERE id=p_file AND submission_id=p_submission;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_submit_content$$
CREATE PROCEDURE sp_submit_content(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_id CHAR(36),IN p_platform INT,IN p_type INT,IN p_unit INT,IN p_url VARCHAR(2048),IN p_caption TEXT,IN p_published DATETIME(3),IN p_notes TEXT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_status VARCHAR(32);DECLARE v_application CHAR(36);DECLARE v_quantity INT;DECLARE v_start DATETIME(3);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_workspace_assert(p_actor,'CREATOR',p_campaign);
 SELECT status INTO v_status FROM campaigns WHERE id=p_campaign FOR UPDATE;
 SELECT x.application_id INTO v_application FROM campaign_creator_allocations x JOIN creators cr ON cr.id=x.creator_id JOIN campaign_applications a ON a.id=x.application_id WHERE x.campaign_id=p_campaign AND cr.user_id=p_actor AND a.status='APPROVED' AND a.creator_id=x.creator_id AND a.campaign_id=x.campaign_id;
 IF v_application IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT start_at INTO v_start FROM content_submission_windows WHERE id=p_campaign;
 IF v_start IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_WINDOW_CLOSED';END IF;
 SELECT quantity INTO v_quantity FROM campaign_deliverables WHERE campaign_id=p_campaign AND platform_id=p_platform AND content_type_id=p_type;
 IF v_quantity IS NULL OR p_unit IS NULL OR p_unit<1 OR p_unit>v_quantity THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_DELIVERABLE_INVALID';END IF;
 IF p_url IS NULL OR CHAR_LENGTH(p_url)<10 OR CHAR_LENGTH(p_url)>2048 OR p_url NOT LIKE 'https://%' OR p_caption IS NULL OR CHAR_LENGTH(TRIM(p_caption))<1 OR CHAR_LENGTH(p_caption)>5000 OR p_notes IS NULL OR CHAR_LENGTH(p_notes)>2000 OR p_published IS NULL OR p_published<v_start OR p_published>UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM content_submissions WHERE application_id=v_application AND platform_id=p_platform AND content_type_id=p_type AND unit_number=p_unit) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_DUPLICATE';END IF;
 INSERT INTO content_submissions(id,application_id,campaign_id,platform_id,content_type_id,unit_number,content_url,caption,published_at,notes) VALUES(p_id,v_application,p_campaign,p_platform,p_type,p_unit,p_url,TRIM(p_caption),p_published,TRIM(p_notes));
 CALL sp_content_snapshot(p_actor,p_id,'INITIAL','Initial content submission');
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CONTENT_SUBMITTED','content_submissions',p_id,p_request,JSON_OBJECT('campaignId',p_campaign,'applicationId',v_application,'platformId',p_platform,'contentTypeId',p_type,'unitNumber',p_unit,'version',1));
 SELECT id,platform_id AS platformId,content_type_id AS contentTypeId,unit_number AS unitNumber,content_url AS contentUrl,caption,published_at AS publishedAt,notes,status,version,created_at AS createdAt FROM content_submissions WHERE id=p_id;
 COMMIT;
END$$
DELIMITER ;
