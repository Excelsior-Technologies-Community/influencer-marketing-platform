-- A capture and its balanced wallet journal commit together.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_funding_record_payment$$
CREATE PROCEDURE sp_funding_record_payment(IN p_id CHAR(36),IN p_order VARCHAR(80),IN p_payment VARCHAR(80),IN p_status VARCHAR(24),IN p_amount BIGINT,IN p_currency CHAR(3),IN p_event VARCHAR(100),IN p_hash CHAR(64),IN p_type VARCHAR(40),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_campaign CHAR(36);DECLARE v_old VARCHAR(24);DECLARE v_payment VARCHAR(80);DECLARE v_attempt VARCHAR(24);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SELECT campaign_id,status,captured_payment_id INTO v_campaign,v_old,v_payment FROM campaign_funding WHERE id=p_id FOR UPDATE;
 IF v_campaign IS NULL OR p_payment IS NULL OR p_payment NOT LIKE 'pay_%' OR p_status IS NULL OR p_status NOT IN ('AUTHORIZED','CAPTURED','FAILED') OR NOT EXISTS(SELECT 1 FROM campaign_funding WHERE id=p_id AND BINARY provider_order_id=BINARY p_order AND amount_minor=p_amount AND currency=p_currency) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_MISMATCH';END IF;
 IF p_event IS NOT NULL THEN
 IF EXISTS(SELECT 1 FROM campaign_payment_events WHERE event_id=p_event AND (BINARY body_hash<>BINARY p_hash OR funding_id<>p_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_EVENT_CONFLICT';END IF;
 INSERT IGNORE INTO campaign_payment_events(event_id,body_hash,funding_id,event_type) VALUES(p_event,p_hash,p_id,p_type);
 END IF;
 IF EXISTS(SELECT 1 FROM campaign_payment_attempts WHERE BINARY provider_payment_id=BINARY p_payment AND funding_id<>p_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_MISMATCH';END IF;
 IF p_status='CAPTURED' AND v_payment IS NOT NULL AND BINARY v_payment<>BINARY p_payment THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_MISMATCH';END IF;
 SELECT status INTO v_attempt FROM campaign_payment_attempts WHERE provider_payment_id=p_payment;
 IF v_attempt IS NULL THEN
 INSERT INTO campaign_payment_attempts(provider_payment_id,funding_id,status,amount_minor,currency) VALUES(p_payment,p_id,p_status,p_amount,p_currency);
 ELSEIF v_attempt<>'CAPTURED' AND (v_attempt<>'FAILED' OR p_status='CAPTURED') THEN
 UPDATE campaign_payment_attempts SET status=p_status WHERE provider_payment_id=p_payment;
 END IF;
 IF p_status='CAPTURED' AND v_old<>'SUCCEEDED' THEN
 UPDATE campaign_funding SET status='SUCCEEDED',captured_payment_id=p_payment WHERE id=p_id;
 INSERT INTO audit_logs(action,entity_type,entity_id,request_id,metadata) VALUES('CAMPAIGN_FUNDED','campaigns',v_campaign,p_request,JSON_OBJECT('fundingId',p_id,'mode','TEST'));
 ELSEIF p_status='FAILED' AND v_attempt IS NULL THEN
 INSERT INTO audit_logs(action,entity_type,entity_id,request_id,metadata) VALUES('FUNDING_ATTEMPT_FAILED','campaigns',v_campaign,p_request,JSON_OBJECT('fundingId',p_id,'mode','TEST'));
 END IF;
 IF p_status='CAPTURED' THEN CALL sp_wallet_post_funding(p_id,p_request);END IF;
 COMMIT;
END$$
DELIMITER ;
