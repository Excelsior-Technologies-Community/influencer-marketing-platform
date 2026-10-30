DELIMITER $$
DROP PROCEDURE IF EXISTS sp_brand_content_owner$$
CREATE PROCEDURE sp_brand_content_owner(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36))
SQL SECURITY INVOKER
BEGIN
 CALL sp_workspace_assert(p_actor,'BRAND_ADMIN',p_campaign);
 IF NOT EXISTS(SELECT 1 FROM content_submissions cs JOIN campaign_creator_allocations x ON x.application_id=cs.application_id JOIN campaign_applications a ON a.id=x.application_id WHERE cs.id=p_submission AND cs.campaign_id=p_campaign AND x.campaign_id=p_campaign AND a.campaign_id=p_campaign AND a.creator_id=x.creator_id AND a.status='APPROVED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NOT_FOUND';END IF;
END$$
DROP PROCEDURE IF EXISTS sp_brand_content_list$$
CREATE PROCEDURE sp_brand_content_list(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_status VARCHAR(24),IN p_q VARCHAR(100),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_assert(p_actor,'BRAND_ADMIN',p_campaign);
 SELECT id,title,status FROM campaigns WHERE id=p_campaign;
 SELECT cs.id,u.name AS creatorName,p.name AS platformName,t.name AS contentTypeName,cs.unit_number AS unitNumber,cs.status,cs.version,cs.created_at AS createdAt,
 (SELECT COUNT(*) FROM content_version_evidence e WHERE e.submission_id=cs.id AND e.version=cs.version) AS evidenceCount
 FROM content_submissions cs JOIN campaign_creator_allocations x ON x.application_id=cs.application_id JOIN campaign_applications a ON a.id=x.application_id JOIN creators cr ON cr.id=x.creator_id JOIN users u ON u.id=cr.user_id JOIN platforms p ON p.id=cs.platform_id JOIN content_types t ON t.id=cs.content_type_id
 WHERE cs.campaign_id=p_campaign AND x.campaign_id=p_campaign AND a.campaign_id=p_campaign AND a.creator_id=x.creator_id AND a.status='APPROVED' AND (p_status IS NULL OR cs.status=p_status) AND (p_q='' OR LOCATE(p_q,u.name)>0)
 ORDER BY cs.created_at DESC,cs.id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM content_submissions cs JOIN campaign_creator_allocations x ON x.application_id=cs.application_id JOIN campaign_applications a ON a.id=x.application_id JOIN creators cr ON cr.id=x.creator_id JOIN users u ON u.id=cr.user_id WHERE cs.campaign_id=p_campaign AND x.campaign_id=p_campaign AND a.campaign_id=p_campaign AND a.creator_id=x.creator_id AND a.status='APPROVED' AND (p_status IS NULL OR cs.status=p_status) AND (p_q='' OR LOCATE(p_q,u.name)>0);
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_brand_content_history$$
CREATE PROCEDURE sp_brand_content_history(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_version INT;
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_brand_content_owner(p_actor,p_campaign,p_submission);
 SELECT COALESCE(p_version,version) INTO v_version FROM content_submissions WHERE id=p_submission;
 IF NOT EXISTS(SELECT 1 FROM content_submission_versions WHERE submission_id=p_submission AND version=v_version) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NOT_FOUND';END IF;
 SELECT cs.id,cs.version,cs.status,cs.unit_number AS unitNumber,p.name AS platformName,t.name AS contentTypeName,u.name AS creatorName,u.status AS creatorAccountStatus,c.status AS campaignStatus,
 (cs.status='SUBMITTED' AND c.status='IN_PROGRESS' AND s.start_at<=UTC_TIMESTAMP(3)) AS canReview,
 EXISTS(SELECT 1 FROM content_submission_windows w WHERE w.id=c.id) AS canRequestRevision
 FROM content_submissions cs JOIN campaigns c ON c.id=cs.campaign_id JOIN campaign_schedules s ON s.campaign_id=c.id JOIN campaign_creator_allocations x ON x.application_id=cs.application_id JOIN creators cr ON cr.id=x.creator_id JOIN users u ON u.id=cr.user_id JOIN platforms p ON p.id=cs.platform_id JOIN content_types t ON t.id=cs.content_type_id WHERE cs.id=p_submission;
 SELECT version,change_type AS changeType,reason,created_at AS createdAt FROM content_submission_versions WHERE submission_id=p_submission ORDER BY version DESC LIMIT 50;
 SELECT version,content_url AS contentUrl,caption,published_at AS publishedAt,notes,status,change_type AS changeType,reason,created_at AS createdAt FROM content_submission_versions WHERE submission_id=p_submission AND version=v_version;
 SELECT b.id,b.title,b.mime_type AS mimeType,b.byte_size AS byteSize,b.page_count AS pageCount FROM content_version_evidence e JOIN content_evidence_blobs b ON b.id=e.evidence_id AND b.submission_id=e.submission_id WHERE e.submission_id=p_submission AND e.version=v_version ORDER BY b.created_at,b.id;
 SELECT id,content_version AS version,decision,from_status AS fromStatus,to_status AS toStatus,reason,created_at AS createdAt FROM content_submission_reviews WHERE submission_id=p_submission ORDER BY id;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_brand_review_content$$
CREATE PROCEDURE sp_brand_review_content(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT,IN p_decision VARCHAR(24),IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_campaign VARCHAR(32);DECLARE v_version INT;DECLARE v_status VARCHAR(24);DECLARE v_target VARCHAR(24);DECLARE v_start DATETIME(3);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_content_owner(p_actor,p_campaign,p_submission);
 SELECT status INTO v_campaign FROM campaigns WHERE id=p_campaign FOR UPDATE;
 SELECT version,status INTO v_version,v_status FROM content_submissions WHERE id=p_submission FOR UPDATE;
 IF p_version IS NULL OR p_version<>v_version THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_CONFLICT';END IF;
 IF v_status<>'SUBMITTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_REVIEW_STATE';END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('APPROVE','REJECT','REQUEST_REVISION') OR p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>500 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_REVIEW_INVALID';END IF;
 SELECT start_at INTO v_start FROM campaign_schedules WHERE campaign_id=p_campaign;
 IF v_campaign<>'IN_PROGRESS' OR v_start IS NULL OR v_start>UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_REVIEW_CLOSED';END IF;
 IF p_decision='REQUEST_REVISION' AND NOT EXISTS(SELECT 1 FROM content_submission_windows WHERE id=p_campaign) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_REVISION_CLOSED';END IF;
 SET v_target=CASE p_decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'REVISION_REQUESTED' END;
 INSERT INTO content_submission_reviews(submission_id,content_version,decision,from_status,to_status,reason,actor_user_id) VALUES(p_submission,v_version,p_decision,v_status,v_target,TRIM(p_reason),p_actor);
 UPDATE content_submissions SET status=v_target WHERE id=p_submission;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CONTENT_REVIEWED','content_submissions',p_submission,p_request,JSON_OBJECT('campaignId',p_campaign,'version',v_version,'decision',p_decision,'status',v_target));
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_brand_content_evidence$$
CREATE PROCEDURE sp_brand_content_evidence(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT,IN p_file CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_content_owner(p_actor,p_campaign,p_submission);
 IF NOT EXISTS(SELECT 1 FROM content_version_evidence WHERE submission_id=p_submission AND version=p_version AND evidence_id=p_file) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NOT_FOUND';END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'BRAND_CONTENT_EVIDENCE_READ','content_submissions',p_submission,p_request,JSON_OBJECT('campaignId',p_campaign,'version',p_version,'evidenceId',p_file));
 SELECT id,mime_type AS mimeType,file_content AS fileContent FROM content_evidence_blobs WHERE id=p_file AND submission_id=p_submission;
 COMMIT;
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
 SELECT id,content_version AS version,decision,from_status AS fromStatus,to_status AS toStatus,reason,created_at AS createdAt FROM content_submission_reviews WHERE submission_id=p_submission ORDER BY id;
 COMMIT;
 END;
END$$
DELIMITER ;