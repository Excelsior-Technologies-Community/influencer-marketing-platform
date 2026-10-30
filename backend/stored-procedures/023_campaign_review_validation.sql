-- Align missing schedule revision with preparation API and require a reason for either decision.
DELIMITER $$
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
  IF p_schedule_revision IS NULL OR COALESCE(v_schedule,0)<>p_schedule_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_SCHEDULE_CONFLICT';END IF;
 END IF;
 IF p_action IN ('SUBMIT','APPROVE') THEN CALL sp_campaign_review_assert_ready(p_id);END IF;
 IF p_action IN ('APPROVE','REJECT') AND (p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>1000) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_INVALID';END IF;
 SET v_target=CASE p_action WHEN 'SUBMIT' THEN 'PENDING_APPROVAL' WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' WHEN 'REVISE' THEN 'DRAFT' END;
 UPDATE campaigns SET status=v_target,revision=revision+1 WHERE id=p_id;
 INSERT INTO campaign_review_history(campaign_id,actor_user_id,from_status,to_status,reason,campaign_revision) VALUES(p_id,p_actor,v_status,v_target,p_reason,v_revision+1);
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,CONCAT('CAMPAIGN_',p_action),'campaigns',p_id,p_request,JSON_OBJECT('fromStatus',v_status,'toStatus',v_target,'revision',v_revision+1));
 COMMIT;
END$$
DELIMITER ;
