DELIMITER $$
DROP PROCEDURE IF EXISTS sp_funding_read$$
CREATE PROCEDURE sp_funding_read(IN p_actor CHAR(36),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_brand CHAR(36);
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_brand_assert(p_actor,v_brand);
 IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_campaign AND brand_id=v_brand) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT id,title,status,revision,total_budget AS totalBudget,currency FROM campaigns WHERE id=p_campaign;
 SELECT id,amount_minor AS amountMinor,currency,provider_key_id AS keyId,provider_order_id AS orderId,status,captured_payment_id AS paymentId,created_at AS createdAt FROM campaign_funding WHERE campaign_id=p_campaign;
 SELECT a.provider_payment_id AS paymentId,a.status,a.amount_minor AS amountMinor,a.currency,a.updated_at AS updatedAt FROM campaign_payment_attempts a JOIN campaign_funding f ON f.id=a.funding_id WHERE f.campaign_id=p_campaign ORDER BY a.updated_at DESC,a.provider_payment_id LIMIT 100;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_funding_reserve$$
CREATE PROCEDURE sp_funding_reserve(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_revision INT,IN p_id CHAR(36),IN p_key VARCHAR(80),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_revision INT;DECLARE v_status VARCHAR(32);DECLARE v_currency CHAR(3);DECLARE v_budget DECIMAL(11,2);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_assert(p_actor,v_brand);
 SELECT revision,status,currency,total_budget INTO v_revision,v_status,v_currency,v_budget FROM campaigns WHERE id=p_campaign AND brand_id=v_brand FOR UPDATE;
 IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 IF v_status NOT IN ('APPROVED','LIVE','PAUSED','APPLICATION_CLOSED','IN_PROGRESS') OR v_currency<>'INR' OR v_budget IS NULL OR v_budget<1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_NOT_ELIGIBLE';END IF;
 IF p_key IS NULL OR p_key NOT LIKE 'rzp_test_%' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM campaign_funding WHERE campaign_id=p_campaign) THEN
 INSERT INTO campaign_funding(id,campaign_id,amount_minor,currency,provider_key_id) VALUES(p_id,p_campaign,CAST(v_budget*100 AS UNSIGNED),'INR',p_key);
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'FUNDING_RESERVED','campaigns',p_campaign,p_request,JSON_OBJECT('fundingId',p_id,'mode','TEST'));
 END IF;
 SELECT id,amount_minor AS amountMinor,currency,provider_key_id AS keyId,provider_order_id AS orderId,status,(id=p_id) AS isNew FROM campaign_funding WHERE campaign_id=p_campaign;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_funding_attach_order$$
CREATE PROCEDURE sp_funding_attach_order(IN p_id CHAR(36),IN p_order VARCHAR(80),IN p_amount BIGINT,IN p_currency CHAR(3),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_campaign CHAR(36);DECLARE v_existing VARCHAR(80);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SELECT campaign_id,provider_order_id INTO v_campaign,v_existing FROM campaign_funding WHERE id=p_id FOR UPDATE;
 IF v_campaign IS NULL OR p_order IS NULL OR p_order NOT LIKE 'order_%' OR NOT EXISTS(SELECT 1 FROM campaign_funding WHERE id=p_id AND amount_minor=p_amount AND currency=p_currency) OR (v_existing IS NOT NULL AND BINARY v_existing<>BINARY p_order) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_MISMATCH';END IF;
 IF v_existing IS NULL THEN
 UPDATE campaign_funding SET provider_order_id=p_order,status='PENDING' WHERE id=p_id;
 INSERT INTO audit_logs(action,entity_type,entity_id,request_id,metadata) VALUES('FUNDING_ORDER_CREATED','campaigns',v_campaign,p_request,JSON_OBJECT('fundingId',p_id,'mode','TEST'));
 END IF;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_funding_setup_review$$
CREATE PROCEDURE sp_funding_setup_review(IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 UPDATE campaign_funding SET status='SETUP_REVIEW' WHERE id=p_id AND provider_order_id IS NULL AND status='CREATING';
END$$
DROP PROCEDURE IF EXISTS sp_funding_order_lookup$$
CREATE PROCEDURE sp_funding_order_lookup(IN p_order VARCHAR(80))
SQL SECURITY INVOKER
BEGIN
 SELECT id,amount_minor AS amountMinor,currency,provider_key_id AS keyId,provider_order_id AS orderId,status FROM campaign_funding WHERE BINARY provider_order_id=BINARY p_order;
END$$
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
 COMMIT;
END$$
DELIMITER ;
