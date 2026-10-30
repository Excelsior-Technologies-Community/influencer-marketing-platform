DELIMITER $$
DROP PROCEDURE IF EXISTS sp_campaign_review_assert_ready$$
CREATE PROCEDURE sp_campaign_review_assert_ready(IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN users u ON u.id=b.user_id JOIN campaign_schedules s ON s.campaign_id=c.id WHERE c.id=p_id AND u.status='ACTIVE' AND u.role_id=2 AND CHAR_LENGTH(TRIM(c.description))>0 AND c.total_budget>0 AND c.currency IN ('INR','USD','EUR','GBP') AND c.creator_slots BETWEEN 1 AND 10000 AND CHAR_LENGTH(TRIM(c.requirements))>0 AND s.applications_open_at<s.application_deadline AND s.application_deadline<=s.start_at AND s.start_at<s.content_deadline AND s.content_deadline<=s.end_at AND s.application_deadline>UTC_TIMESTAMP(3) AND s.start_at>UTC_TIMESTAMP(3)) OR
 NOT EXISTS(SELECT 1 FROM campaign_platforms WHERE campaign_id=p_id) OR
 EXISTS(SELECT 1 FROM campaign_platforms x JOIN platforms p ON p.id=x.platform_id WHERE x.campaign_id=p_id AND p.is_active=FALSE) OR
 NOT EXISTS(SELECT 1 FROM campaign_categories WHERE campaign_id=p_id) OR
 EXISTS(SELECT 1 FROM campaign_categories x JOIN categories c ON c.id=x.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE x.campaign_id=p_id AND (c.is_active=FALSE OR parent.is_active=FALSE)) OR
 NOT EXISTS(SELECT 1 FROM campaign_content_types WHERE campaign_id=p_id) OR
 EXISTS(SELECT 1 FROM campaign_content_types x JOIN content_types t ON t.id=x.content_type_id WHERE x.campaign_id=p_id AND t.is_active=FALSE) OR
 NOT EXISTS(SELECT 1 FROM campaign_deliverables WHERE campaign_id=p_id) OR
 EXISTS(SELECT 1 FROM campaign_deliverables d WHERE d.campaign_id=p_id AND (d.quantity<1 OR d.quantity>100 OR NOT EXISTS(SELECT 1 FROM campaign_platforms p WHERE p.campaign_id=p_id AND p.platform_id=d.platform_id) OR NOT EXISTS(SELECT 1 FROM campaign_content_types t WHERE t.campaign_id=p_id AND t.content_type_id=d.content_type_id))) OR
 NOT EXISTS(SELECT 1 FROM campaign_files WHERE campaign_id=p_id AND kind='BRIEF')
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_READY'; END IF;
END$$
DROP PROCEDURE IF EXISTS sp_campaign_review_transition$$
CREATE PROCEDURE sp_campaign_review_transition(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_action VARCHAR(20),IN p_revision INT,IN p_schedule_revision INT,IN p_reason VARCHAR(1000),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_status VARCHAR(32);DECLARE v_target VARCHAR(32);DECLARE v_revision INT;DECLARE v_schedule INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 IF p_action IN ('SUBMIT','REVISE') THEN
  CALL sp_brand_assert(p_actor,v_brand);
  SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id AND brand_id=v_brand FOR UPDATE;
 ELSEIF p_action IN ('APPROVE','REJECT') THEN
  CALL sp_admin_assert(p_actor);
  SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id FOR UPDATE;
 ELSE SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_INVALID'; END IF;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 IF (p_action='SUBMIT' AND v_status<>'DRAFT') OR (p_action='REVISE' AND v_status<>'REJECTED') OR (p_action IN ('APPROVE','REJECT') AND v_status<>'PENDING_APPROVAL') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
 IF p_action='SUBMIT' THEN
  SELECT revision INTO v_schedule FROM campaign_schedules WHERE campaign_id=p_id FOR UPDATE;
  IF p_schedule_revision IS NULL OR v_schedule IS NULL OR v_schedule<>p_schedule_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_SCHEDULE_CONFLICT';END IF;
 END IF;
 IF p_action IN ('SUBMIT','APPROVE') THEN CALL sp_campaign_review_assert_ready(p_id);END IF;
 IF p_action='REJECT' AND (p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>1000) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_INVALID';END IF;
 SET v_target=CASE p_action WHEN 'SUBMIT' THEN 'PENDING_APPROVAL' WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' WHEN 'REVISE' THEN 'DRAFT' END;
 UPDATE campaigns SET status=v_target,revision=revision+1 WHERE id=p_id;
 INSERT INTO campaign_review_history(campaign_id,actor_user_id,from_status,to_status,reason,campaign_revision) VALUES(p_id,p_actor,v_status,v_target,p_reason,v_revision+1);
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,CONCAT('CAMPAIGN_',p_action),'campaigns',p_id,p_request,JSON_OBJECT('fromStatus',v_status,'toStatus',v_target,'revision',v_revision+1));
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_campaign_review_list$$
CREATE PROCEDURE sp_campaign_review_list(IN p_actor CHAR(36),IN p_status VARCHAR(32),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=1 AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_FORBIDDEN';END IF;
 SELECT c.id,c.title,c.status,c.total_budget AS totalBudget,c.currency,c.creator_slots AS creatorSlots,c.revision,c.updated_at AS updatedAt,b.company_name AS companyName,u.status AS brandStatus FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN users u ON u.id=b.user_id WHERE (c.status='PENDING_APPROVAL' OR EXISTS(SELECT 1 FROM campaign_review_history h WHERE h.campaign_id=c.id)) AND (p_status IS NULL OR c.status=p_status) ORDER BY c.updated_at DESC,c.id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM campaigns c WHERE (c.status='PENDING_APPROVAL' OR EXISTS(SELECT 1 FROM campaign_review_history h WHERE h.campaign_id=c.id)) AND (p_status IS NULL OR c.status=p_status);
END$$
DROP PROCEDURE IF EXISTS sp_campaign_review_detail$$
CREATE PROCEDURE sp_campaign_review_detail(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_admin BOOLEAN)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_allowed BOOLEAN DEFAULT FALSE;
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 IF p_admin THEN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=1 AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_FORBIDDEN';END IF;
  SET v_allowed=EXISTS(SELECT 1 FROM campaigns c WHERE c.id=p_id AND (c.status='PENDING_APPROVAL' OR EXISTS(SELECT 1 FROM campaign_review_history h WHERE h.campaign_id=c.id)));
 ELSE
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=2 AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN';END IF;
  SET v_allowed=EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_id AND b.user_id=p_actor);
 END IF;
 IF NOT v_allowed THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT c.id,c.title,c.description,c.total_budget AS totalBudget,c.currency,c.creator_slots AS creatorSlots,c.requirements,c.status,c.revision,b.company_name AS companyName,u.status AS brandStatus,s.applications_open_at AS applicationsOpenAt,s.application_deadline AS applicationDeadline,s.start_at AS startAt,s.content_deadline AS contentDeadline,s.end_at AS endAt,COALESCE(s.revision,0) AS scheduleRevision FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN users u ON u.id=b.user_id LEFT JOIN campaign_schedules s ON s.campaign_id=c.id WHERE c.id=p_id;
 SELECT p.id,p.name,p.is_active AS isAvailable FROM campaign_platforms x JOIN platforms p ON p.id=x.platform_id WHERE x.campaign_id=p_id ORDER BY p.name;
 SELECT c.id,c.name,(c.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) AS isAvailable FROM campaign_categories x JOIN categories c ON c.id=x.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE x.campaign_id=p_id ORDER BY c.name;
 SELECT t.id,t.name,t.is_active AS isAvailable FROM campaign_content_types x JOIN content_types t ON t.id=x.content_type_id WHERE x.campaign_id=p_id ORDER BY t.name;
 SELECT p.name AS platformName,t.name AS contentTypeName,d.quantity,d.description FROM campaign_deliverables d JOIN platforms p ON p.id=d.platform_id JOIN content_types t ON t.id=d.content_type_id WHERE d.campaign_id=p_id ORDER BY p.name,t.name;
 SELECT id,kind,title,mime_type AS mimeType,byte_size AS byteSize,revision FROM campaign_files WHERE campaign_id=p_id ORDER BY kind,id;
 SELECT h.id,h.from_status AS fromStatus,h.to_status AS toStatus,h.reason,h.campaign_revision AS campaignRevision,h.created_at AS createdAt,u.name AS actorName,r.code AS actorRole FROM campaign_review_history h JOIN users u ON u.id=h.actor_user_id JOIN roles r ON r.id=u.role_id WHERE h.campaign_id=p_id ORDER BY h.id;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_admin_campaign_review_file$$
CREATE PROCEDURE sp_admin_campaign_review_file(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_file CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 CALL sp_admin_assert(p_actor);
 IF NOT EXISTS(SELECT 1 FROM campaigns c WHERE c.id=p_id AND (c.status='PENDING_APPROVAL' OR EXISTS(SELECT 1 FROM campaign_review_history h WHERE h.campaign_id=c.id))) OR NOT EXISTS(SELECT 1 FROM campaign_files WHERE campaign_id=p_id AND id=p_file) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_FILE_NOT_FOUND';END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CAMPAIGN_REVIEW_FILE_READ','campaign_files',p_file,p_request,JSON_OBJECT('campaignId',p_id));
 SELECT id,kind,mime_type AS mimeType,file_content AS fileContent FROM campaign_files WHERE campaign_id=p_id AND id=p_file;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_get_campaigns$$
CREATE PROCEDURE sp_get_campaigns(IN p_actor CHAR(36),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_brand CHAR(36);
 SELECT b.id INTO v_brand FROM brands b JOIN users u ON u.id=b.user_id WHERE u.id=p_actor AND u.role_id=2 AND u.status='ACTIVE';
 IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN';END IF;
 SELECT id,title,status,total_budget AS totalBudget,currency,creator_slots AS creatorSlots,revision,updated_at AS updatedAt FROM campaigns WHERE brand_id=v_brand ORDER BY updated_at DESC,id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM campaigns WHERE brand_id=v_brand;
END$$
DELIMITER ;
