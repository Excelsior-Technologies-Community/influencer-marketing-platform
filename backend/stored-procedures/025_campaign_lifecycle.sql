DELIMITER $$
-- Call only inside a transaction holding the shared role and campaign locks.
DROP PROCEDURE IF EXISTS sp_campaign_lifecycle_record$$
CREATE PROCEDURE sp_campaign_lifecycle_record(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_action VARCHAR(32),IN p_from VARCHAR(32),IN p_to VARCHAR(32),IN p_reason VARCHAR(1000),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_revision INT;
 UPDATE campaigns SET status=p_to,revision=revision+1 WHERE id=p_id;
 SELECT revision INTO v_revision FROM campaigns WHERE id=p_id;
 INSERT INTO campaign_lifecycle_history(campaign_id,actor_user_id,action,from_status,to_status,reason,campaign_revision) VALUES(p_id,p_actor,p_action,p_from,p_to,p_reason,v_revision);
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,CONCAT('CAMPAIGN_',p_action),'campaigns',p_id,p_request,JSON_OBJECT('fromStatus',p_from,'toStatus',p_to,'revision',v_revision));
END$$
DROP PROCEDURE IF EXISTS sp_change_campaign_status$$
CREATE PROCEDURE sp_change_campaign_status(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_action VARCHAR(20),IN p_revision INT,IN p_reason VARCHAR(1000),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_status VARCHAR(32);DECLARE v_revision INT;DECLARE v_target VARCHAR(32);DECLARE v_admin BOOLEAN DEFAULT FALSE;DECLARE v_open DATETIME(3);DECLARE v_deadline DATETIME(3);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SET v_admin=EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=1 AND status='ACTIVE');
 IF v_admin THEN
  CALL sp_admin_assert(p_actor);
  SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id FOR UPDATE;
 ELSE
  CALL sp_brand_assert(p_actor,v_brand);
  SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id AND brand_id=v_brand FOR UPDATE;
 END IF;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>1000 OR p_action IS NULL OR p_action NOT IN ('PUBLISH','PAUSE','RESUME','CANCEL') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_LIFECYCLE_INVALID';END IF;
 IF v_admin AND p_action<>'CANCEL' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_LIFECYCLE_FORBIDDEN';END IF;
 IF p_action='PUBLISH' THEN
  IF v_status<>'APPROVED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
  CALL sp_campaign_review_assert_ready(p_id);
  SELECT applications_open_at INTO v_open FROM campaign_schedules WHERE campaign_id=p_id;
  IF v_open>UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_OPEN';END IF;
  SET v_target='LIVE';
 ELSEIF p_action='PAUSE' THEN
  IF v_status<>'LIVE' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
  SELECT application_deadline INTO v_deadline FROM campaign_schedules WHERE campaign_id=p_id;
  IF v_deadline<=UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REFRESH_REQUIRED';END IF;
  SET v_target='PAUSED';
 ELSEIF p_action='RESUME' THEN
  IF v_status<>'PAUSED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
  CALL sp_campaign_review_assert_ready(p_id);
  SET v_target='LIVE';
 ELSE
  IF v_status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','LIVE','PAUSED','APPLICATION_CLOSED','IN_PROGRESS') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
  SET v_target='CANCELLED';
 END IF;
 CALL sp_campaign_lifecycle_record(p_actor,p_id,p_action,v_status,v_target,p_reason,p_request);
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_refresh_campaign_status$$
CREATE PROCEDURE sp_refresh_campaign_status(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_status VARCHAR(32);DECLARE v_revision INT;DECLARE v_apply DATETIME(3);DECLARE v_start DATETIME(3);DECLARE v_now DATETIME(3);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=1 AND status='ACTIVE') THEN CALL sp_admin_assert(p_actor);
  ELSE
   CALL sp_brand_assert(p_actor,v_brand);
   IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_id AND brand_id=v_brand) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
  END IF;
 END IF;
 SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id FOR UPDATE;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT application_deadline,start_at INTO v_apply,v_start FROM campaign_schedules WHERE campaign_id=p_id;
 SET v_now=UTC_TIMESTAMP(3);
 IF v_status='APPROVED' AND (v_apply<=v_now OR v_start<=v_now) THEN
  CALL sp_campaign_lifecycle_record(NULL,p_id,'EXPIRE',v_status,'EXPIRED','Approved campaign was not published before its application deadline or start.',p_request);
 ELSE
  IF v_status IN ('LIVE','PAUSED') AND v_apply<=v_now THEN
   CALL sp_campaign_lifecycle_record(NULL,p_id,'CLOSE_APPLICATIONS',v_status,'APPLICATION_CLOSED','Application deadline reached. Pausing does not extend the schedule.',p_request);
   SET v_status='APPLICATION_CLOSED';
  END IF;
  IF v_status='APPLICATION_CLOSED' AND v_start<=v_now THEN
   CALL sp_campaign_lifecycle_record(NULL,p_id,'START',v_status,'IN_PROGRESS','Scheduled campaign start reached. Content completion requires later workflow evidence.',p_request);
  END IF;
 END IF;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_due_campaign_statuses$$
CREATE PROCEDURE sp_due_campaign_statuses()
SQL SECURITY INVOKER
BEGIN
 SELECT c.id FROM campaigns c JOIN campaign_schedules s ON s.campaign_id=c.id WHERE (c.status IN ('APPROVED','LIVE','PAUSED') AND (s.application_deadline<=UTC_TIMESTAMP(3) OR s.start_at<=UTC_TIMESTAMP(3))) OR (c.status='APPLICATION_CLOSED' AND s.start_at<=UTC_TIMESTAMP(3)) ORDER BY s.application_deadline,c.id LIMIT 100;
END$$
DROP PROCEDURE IF EXISTS sp_get_campaign_lifecycle$$
CREATE PROCEDURE sp_get_campaign_lifecycle(IN p_actor CHAR(36),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_brand CHAR(36);DECLARE v_admin BOOLEAN DEFAULT FALSE;
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
  SET v_admin=EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=1 AND status='ACTIVE');
  IF NOT v_admin THEN
   SELECT b.id INTO v_brand FROM brands b JOIN users u ON u.id=b.user_id WHERE u.id=p_actor AND u.role_id=2 AND u.status='ACTIVE';
   IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN';END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_id AND (v_admin OR brand_id=v_brand)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
  SELECT c.id,c.title,c.status,c.revision,s.applications_open_at AS applicationsOpenAt,s.application_deadline AS applicationDeadline,s.start_at AS startAt,s.end_at AS endAt,UTC_TIMESTAMP(3) AS serverTime,(c.status='DRAFT' AND NOT EXISTS(SELECT 1 FROM campaign_review_history h WHERE h.campaign_id=c.id) AND NOT EXISTS(SELECT 1 FROM campaign_lifecycle_history h WHERE h.campaign_id=c.id)) AS canDelete FROM campaigns c LEFT JOIN campaign_schedules s ON s.campaign_id=c.id WHERE c.id=p_id;
  SELECT x.*,u.name AS actorName FROM (
   SELECT CONCAT('review-',id) AS id,actor_user_id AS actorUserId,'REVIEW' AS action,from_status AS fromStatus,to_status AS toStatus,reason,campaign_revision AS campaignRevision,created_at AS createdAt FROM campaign_review_history WHERE campaign_id=p_id
   UNION ALL
   SELECT CONCAT('lifecycle-',id),actor_user_id,action,from_status,to_status,reason,campaign_revision,created_at FROM campaign_lifecycle_history WHERE campaign_id=p_id
  ) x LEFT JOIN users u ON u.id=x.actorUserId ORDER BY x.campaignRevision,x.id;
  COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_delete_campaign$$
CREATE PROCEDURE sp_delete_campaign(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_revision INT;DECLARE v_status VARCHAR(32);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_assert(p_actor,v_brand);
 SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id AND brand_id=v_brand FOR UPDATE;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 IF v_status<>'DRAFT' OR EXISTS(SELECT 1 FROM campaign_review_history WHERE campaign_id=p_id) OR EXISTS(SELECT 1 FROM campaign_lifecycle_history WHERE campaign_id=p_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_DELETE_DENIED';END IF;
 DELETE FROM campaigns WHERE id=p_id;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CAMPAIGN_DRAFT_DELETED','campaigns',p_id,p_request,JSON_OBJECT('revision',v_revision));
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_list_campaign_management$$
CREATE PROCEDURE sp_list_campaign_management(IN p_actor CHAR(36),IN p_status VARCHAR(32),IN p_q VARCHAR(100),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_brand CHAR(36);
 SELECT b.id INTO v_brand FROM brands b JOIN users u ON u.id=b.user_id WHERE u.id=p_actor AND u.role_id=2 AND u.status='ACTIVE';
 IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN';END IF;
 SELECT id,title,status,total_budget AS totalBudget,currency,creator_slots AS creatorSlots,revision,updated_at AS updatedAt FROM campaigns WHERE brand_id=v_brand AND (p_status IS NULL OR status=p_status) AND (p_q='' OR LOCATE(p_q,title)>0) ORDER BY updated_at DESC,id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM campaigns WHERE brand_id=v_brand AND (p_status IS NULL OR status=p_status) AND (p_q='' OR LOCATE(p_q,title)>0);
END$$
DELIMITER ;
