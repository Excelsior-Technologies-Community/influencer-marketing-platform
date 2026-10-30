DELIMITER $$
DROP PROCEDURE IF EXISTS sp_creator_content_submissions$$
CREATE PROCEDURE sp_creator_content_submissions(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_application CHAR(36);
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_assert(p_actor,'CREATOR',p_campaign);
 SELECT x.application_id INTO v_application FROM campaign_creator_allocations x JOIN creators cr ON cr.id=x.creator_id JOIN campaign_applications a ON a.id=x.application_id
 WHERE x.campaign_id=p_campaign AND cr.user_id=p_actor AND a.status='APPROVED' AND a.creator_id=x.creator_id AND a.campaign_id=x.campaign_id;
 IF v_application IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT c.id,c.title,c.status,s.start_at AS startAt,s.content_deadline AS contentDeadline,EXISTS(SELECT 1 FROM content_submission_windows w WHERE w.id=c.id) AS canSubmit FROM campaigns c LEFT JOIN campaign_schedules s ON s.campaign_id=c.id WHERE c.id=p_campaign;
 SELECT d.platform_id AS platformId,d.content_type_id AS contentTypeId,p.name AS platformName,t.name AS contentTypeName,d.quantity,d.description,
 (SELECT JSON_ARRAYAGG(cs.unit_number) FROM content_submissions cs WHERE cs.application_id=v_application AND cs.platform_id=d.platform_id AND cs.content_type_id=d.content_type_id) AS submittedUnits
 FROM campaign_deliverables d JOIN platforms p ON p.id=d.platform_id JOIN content_types t ON t.id=d.content_type_id WHERE d.campaign_id=p_campaign ORDER BY d.platform_id,d.content_type_id;
 SELECT cs.id,cs.platform_id AS platformId,cs.content_type_id AS contentTypeId,p.name AS platformName,t.name AS contentTypeName,cs.unit_number AS unitNumber,cs.content_url AS contentUrl,cs.caption,cs.published_at AS publishedAt,cs.notes,cs.status,cs.version,cs.created_at AS createdAt FROM content_submissions cs JOIN platforms p ON p.id=cs.platform_id JOIN content_types t ON t.id=cs.content_type_id WHERE cs.application_id=v_application AND cs.campaign_id=p_campaign ORDER BY cs.created_at DESC,cs.id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM content_submissions WHERE application_id=v_application AND campaign_id=p_campaign;
 COMMIT;
 END;
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
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CONTENT_SUBMITTED','content_submissions',p_id,p_request,JSON_OBJECT('campaignId',p_campaign,'applicationId',v_application,'platformId',p_platform,'contentTypeId',p_type,'unitNumber',p_unit,'version',1));
 SELECT id,platform_id AS platformId,content_type_id AS contentTypeId,unit_number AS unitNumber,content_url AS contentUrl,caption,published_at AS publishedAt,notes,status,version,created_at AS createdAt FROM content_submissions WHERE id=p_id;
 COMMIT;
END$$
DELIMITER ;
