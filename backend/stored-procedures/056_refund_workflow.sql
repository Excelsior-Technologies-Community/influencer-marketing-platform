DELIMITER $$
DROP PROCEDURE IF EXISTS sp_refund_read$$
CREATE PROCEDURE sp_refund_read(IN p_actor CHAR(36),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_actor(p_actor,'BRAND_ADMIN');
 IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_campaign AND b.user_id=p_actor) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT c.id,c.title,c.status,c.revision,CAST(f.amount_minor AS CHAR) AS amountMinor,f.currency,f.id AS fundingId,f.provider_key_id AS keyId,f.captured_payment_id AS paymentId,
 (f.status='SUCCEEDED' AND c.status='CANCELLED' AND NOT EXISTS(SELECT 1 FROM campaign_refunds r WHERE r.funding_id=f.id) AND NOT EXISTS(SELECT 1 FROM wallet_journals j WHERE j.funding_id=f.id AND j.event_type='CREATOR_RELEASE') AND NOT EXISTS(SELECT 1 FROM payment_review_cases x WHERE x.funding_id=f.id AND x.status='OPEN') AND EXISTS(SELECT 1 FROM wallet_journals j WHERE j.funding_id=f.id AND j.event_type='FUNDING_CAPTURE' AND j.status='POSTED')) AS canRefund
 FROM campaigns c LEFT JOIN campaign_funding f ON f.campaign_id=c.id WHERE c.id=p_campaign;
 SELECT r.id,CAST(r.amount_minor AS CHAR) AS amountMinor,r.provider_refund_id AS refundId,r.status,r.reason,r.created_at AS createdAt,r.updated_at AS updatedAt FROM campaign_refunds r JOIN campaign_funding f ON f.id=r.funding_id WHERE f.campaign_id=p_campaign;
 SELECT h.id,h.status,h.created_at AS createdAt FROM refund_history h JOIN campaign_refunds r ON r.id=h.refund_id JOIN campaign_funding f ON f.id=r.funding_id WHERE f.campaign_id=p_campaign ORDER BY h.id;
 SELECT x.id,x.kind,CAST(x.amount_minor AS CHAR) AS amountMinor,x.status,x.provider_status AS providerStatus,x.reason,x.revision,x.created_at AS createdAt FROM payment_review_cases x JOIN campaign_funding f ON f.id=x.funding_id WHERE f.campaign_id=p_campaign ORDER BY x.created_at DESC LIMIT 100;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_refund_reserve$$
CREATE PROCEDURE sp_refund_reserve(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_revision INT,IN p_id CHAR(36),IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_funding CHAR(36);DECLARE v_status VARCHAR(32);DECLARE v_revision INT;DECLARE v_amount BIGINT UNSIGNED;DECLARE v_new BOOL DEFAULT FALSE;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;CALL sp_brand_assert(p_actor,v_brand);
 SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_campaign AND brand_id=v_brand FOR UPDATE;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>500 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_INVALID';END IF;
 SELECT id,amount_minor INTO v_funding,v_amount FROM campaign_funding WHERE campaign_id=p_campaign AND status='SUCCEEDED' FOR UPDATE;
 IF v_funding IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_BLOCKED';END IF;
 IF NOT EXISTS(SELECT 1 FROM campaign_refunds WHERE funding_id=v_funding) THEN
  IF v_status<>'CANCELLED' OR EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=v_funding AND event_type='CREATOR_RELEASE') OR EXISTS(SELECT 1 FROM payment_review_cases WHERE funding_id=v_funding AND status='OPEN') OR NOT EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=v_funding AND event_type='FUNDING_CAPTURE' AND status='POSTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_BLOCKED';END IF;
  INSERT INTO campaign_refunds(id,funding_id,amount_minor,reason,requested_by) VALUES(p_id,v_funding,v_amount,TRIM(p_reason),p_actor);
  INSERT INTO refund_history(refund_id,status) VALUES(p_id,'CREATING');SET v_new=TRUE;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'REFUND_REQUESTED','campaigns',p_campaign,p_request,JSON_OBJECT('refundRequestId',p_id,'mode','TEST'));
 END IF;
 COMMIT;
 SELECT r.id,CAST(r.amount_minor AS CHAR) AS amountMinor,f.captured_payment_id AS paymentId,f.provider_key_id AS keyId,r.provider_refund_id AS refundId,r.status,v_new AS isNew FROM campaign_refunds r JOIN campaign_funding f ON f.id=r.funding_id WHERE r.funding_id=v_funding;
END$$
DROP PROCEDURE IF EXISTS sp_refund_setup_review$$
CREATE PROCEDURE sp_refund_setup_review(IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_status VARCHAR(24);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;SELECT status INTO v_status FROM campaign_refunds WHERE id=p_id FOR UPDATE;
 IF v_status='CREATING' THEN UPDATE campaign_refunds SET status='SETUP_REVIEW' WHERE id=p_id;INSERT INTO refund_history(refund_id,status) VALUES(p_id,'SETUP_REVIEW');END IF;COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_refund_payment_lookup$$
CREATE PROCEDURE sp_refund_payment_lookup(IN p_payment VARCHAR(80))
SQL SECURITY INVOKER
BEGIN
 SELECT f.id,f.campaign_id AS campaignId,CAST(f.amount_minor AS CHAR) AS amountMinor,f.provider_key_id AS keyId,f.captured_payment_id AS paymentId,r.id AS receipt,r.provider_refund_id AS refundId,r.status AS refundStatus FROM campaign_funding f LEFT JOIN campaign_refunds r ON r.funding_id=f.id WHERE BINARY f.captured_payment_id=BINARY p_payment AND f.status='SUCCEEDED';
END$$
DROP PROCEDURE IF EXISTS sp_refund_record$$
CREATE PROCEDURE sp_refund_record(IN p_id CHAR(36),IN p_provider VARCHAR(80),IN p_payment VARCHAR(80),IN p_amount BIGINT,IN p_currency CHAR(3),IN p_status VARCHAR(24),IN p_receipt VARCHAR(80),IN p_event VARCHAR(100),IN p_hash CHAR(64),IN p_type VARCHAR(40),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_funding CHAR(36);DECLARE v_campaign CHAR(36);DECLARE v_old VARCHAR(24);DECLARE v_journal CHAR(36);DECLARE v_brand CHAR(36);DECLARE v_clear CHAR(36);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SELECT r.funding_id,r.status,f.campaign_id INTO v_funding,v_old,v_campaign FROM campaign_refunds r JOIN campaign_funding f ON f.id=r.funding_id WHERE r.id=p_id FOR UPDATE;
 IF v_funding IS NULL OR p_provider IS NULL OR p_provider NOT REGEXP '^rfnd_[A-Za-z0-9]{1,64}$' OR p_status IS NULL OR p_status NOT IN ('PENDING','PROCESSED','FAILED') OR NOT EXISTS(SELECT 1 FROM campaign_refunds r JOIN campaign_funding f ON f.id=r.funding_id WHERE r.id=p_id AND r.amount_minor=p_amount AND f.amount_minor=p_amount AND f.currency=p_currency AND p_currency='INR' AND f.status='SUCCEEDED' AND BINARY f.captured_payment_id=BINARY p_payment AND BINARY r.id=BINARY p_receipt AND (r.provider_refund_id IS NULL OR BINARY r.provider_refund_id=BINARY p_provider)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_MISMATCH';END IF;
 IF p_event IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM campaign_payment_events WHERE event_id=p_event AND (BINARY body_hash<>BINARY p_hash OR funding_id<>v_funding)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_EVENT_CONFLICT';END IF;
  INSERT IGNORE INTO campaign_payment_events(event_id,body_hash,funding_id,event_type) VALUES(p_event,p_hash,v_funding,p_type);
 END IF;
 IF v_old<>'PROCESSED' AND (v_old<>'FAILED' OR p_status='PROCESSED') THEN
  UPDATE campaign_refunds SET provider_refund_id=p_provider,status=p_status WHERE id=p_id;
  IF v_old<>p_status THEN INSERT INTO refund_history(refund_id,status) VALUES(p_id,p_status);END IF;
 END IF;
 IF p_status='PROCESSED' AND NOT EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=v_funding AND event_type='REFUND_PROCESSED') THEN
  IF EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=v_funding AND event_type='CREATOR_RELEASE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_REVIEW_REQUIRED';END IF;
  SELECT a.id INTO v_brand FROM wallet_accounts a JOIN brands b ON b.user_id=a.owner_user_id JOIN campaigns c ON c.brand_id=b.id WHERE c.id=v_campaign AND a.account_type='BRAND_HELD' AND a.currency='INR' AND a.mode='TEST';
  SELECT id INTO v_clear FROM wallet_accounts WHERE account_code='RAZORPAY_TEST_CLEARING_INR' AND account_type='PROCESSOR_CLEARING';
  SET v_journal=UUID();INSERT INTO wallet_journals(id,funding_id,event_type,amount_minor) VALUES(v_journal,v_funding,'REFUND_PROCESSED',p_amount);
  INSERT INTO wallet_entries(journal_id,account_id,direction,amount_minor) VALUES(v_journal,v_brand,'DEBIT',p_amount),(v_journal,v_clear,'CREDIT',p_amount);
  UPDATE wallet_journals SET status='POSTED',posted_at=UTC_TIMESTAMP(6) WHERE id=v_journal;
  INSERT INTO audit_logs(action,entity_type,entity_id,request_id,metadata) VALUES('REFUND_PROCESSED','campaigns',v_campaign,p_request,JSON_OBJECT('journalId',v_journal,'refundRequestId',p_id,'mode','TEST'));
 END IF;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_refund_review_request$$
CREATE PROCEDURE sp_refund_review_request(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_amount BIGINT,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_funding CHAR(36);DECLARE v_case CHAR(36);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;CALL sp_brand_assert(p_actor,v_brand);
 SELECT f.id INTO v_funding FROM campaigns c JOIN campaign_funding f ON f.campaign_id=c.id AND f.status='SUCCEEDED' WHERE c.id=p_campaign AND c.brand_id=v_brand FOR UPDATE;
 IF v_funding IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_BLOCKED';END IF;
 IF p_amount IS NULL OR p_amount<1 OR NOT EXISTS(SELECT 1 FROM campaign_funding WHERE id=v_funding AND p_amount<=amount_minor) OR p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>500 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM payment_review_cases WHERE funding_id=v_funding AND kind='POLICY_REQUEST' AND status='OPEN') THEN
  SET v_case=UUID();INSERT INTO payment_review_cases(id,funding_id,case_key,kind,amount_minor,reason) VALUES(v_case,v_funding,v_case,'POLICY_REQUEST',p_amount,TRIM(p_reason));
  INSERT INTO payment_review_notes(case_id,actor_user_id,action,reason) VALUES(v_case,p_actor,'REQUEST',TRIM(p_reason));
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'PAYMENT_REVIEW_REQUESTED','campaigns',p_campaign,p_request,JSON_OBJECT('caseId',v_case));
 END IF;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_refund_flag_external$$
CREATE PROCEDURE sp_refund_flag_external(IN p_funding CHAR(36),IN p_provider VARCHAR(80),IN p_amount BIGINT,IN p_status VARCHAR(24),IN p_event VARCHAR(100),IN p_hash CHAR(64),IN p_type VARCHAR(40),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_case CHAR(36);DECLARE v_campaign CHAR(36);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SELECT campaign_id INTO v_campaign FROM campaign_funding WHERE id=p_funding FOR UPDATE;
 IF v_campaign IS NULL OR p_provider IS NULL OR p_provider NOT REGEXP '^rfnd_[A-Za-z0-9]{1,64}$' OR p_amount IS NULL OR p_amount<1 OR p_status IS NULL OR p_status NOT IN ('PENDING','PROCESSED','FAILED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_MISMATCH';END IF;
 IF p_event IS NOT NULL THEN
 IF EXISTS(SELECT 1 FROM campaign_payment_events WHERE event_id=p_event AND (BINARY body_hash<>BINARY p_hash OR funding_id<>p_funding)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FUNDING_EVENT_CONFLICT';END IF;
 INSERT IGNORE INTO campaign_payment_events(event_id,body_hash,funding_id,event_type) VALUES(p_event,p_hash,p_funding,p_type);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM payment_review_cases WHERE case_key=CONCAT('EXTERNAL:',p_provider)) THEN
  SET v_case=UUID();INSERT INTO payment_review_cases(id,funding_id,case_key,kind,amount_minor,provider_refund_id,provider_status,reason) VALUES(v_case,p_funding,CONCAT('EXTERNAL:',p_provider),'EXTERNAL_REFUND',p_amount,p_provider,p_status,'Provider refund requires manual reconciliation; automatic wallet release is blocked.');
  INSERT INTO audit_logs(action,entity_type,entity_id,request_id,metadata) VALUES('EXTERNAL_REFUND_REVIEW','campaigns',v_campaign,p_request,JSON_OBJECT('caseId',v_case,'mode','TEST'));
 ELSE
  IF NOT EXISTS(SELECT 1 FROM payment_review_cases WHERE case_key=CONCAT('EXTERNAL:',p_provider) AND funding_id=p_funding AND amount_minor=p_amount) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_MISMATCH';END IF;
  UPDATE payment_review_cases SET provider_status=IF(provider_status='PROCESSED','PROCESSED',p_status) WHERE case_key=CONCAT('EXTERNAL:',p_provider) AND NOT(provider_status<=>p_status);
 END IF;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_admin_payment_reviews$$
CREATE PROCEDURE sp_admin_payment_reviews(IN p_actor CHAR(36),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=p_actor AND u.status='ACTIVE' AND r.code='SUPER_ADMIN') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_FORBIDDEN';END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR p_offset IS NULL OR p_offset<0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_INVALID';END IF;
 SELECT x.id,x.kind,x.status,x.revision,CAST(x.amount_minor AS CHAR) AS amountMinor,x.reason,x.provider_status AS providerStatus,x.created_at AS createdAt,c.id AS campaignId,c.title AS campaignTitle,
 (SELECT JSON_ARRAYAGG(JSON_OBJECT('action',n.action,'reason',n.reason,'createdAt',n.created_at)) FROM payment_review_notes n WHERE n.case_id=x.id) AS notes FROM payment_review_cases x JOIN campaign_funding f ON f.id=x.funding_id JOIN campaigns c ON c.id=f.campaign_id ORDER BY x.created_at DESC,x.id DESC LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM payment_review_cases;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_admin_payment_review_note$$
CREATE PROCEDURE sp_admin_payment_review_note(IN p_actor CHAR(36),IN p_case CHAR(36),IN p_revision INT,IN p_action VARCHAR(16),IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_revision INT;DECLARE v_kind VARCHAR(24);DECLARE v_status VARCHAR(8);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=p_actor AND u.status='ACTIVE' AND r.code='SUPER_ADMIN') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_FORBIDDEN';END IF;
 SELECT revision,kind,status INTO v_revision,v_kind,v_status FROM payment_review_cases WHERE id=p_case FOR UPDATE;
 IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision OR v_status<>'OPEN' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_CONFLICT';END IF;
 IF p_action IS NULL OR p_action NOT IN ('NOTE','DECLINE') OR p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>500 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_INVALID';END IF;
 IF p_action='DECLINE' AND v_kind='EXTERNAL_REFUND' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFUND_REVIEW_REQUIRED';END IF;
 UPDATE payment_review_cases SET status=IF(p_action='DECLINE','CLOSED','OPEN'),revision=revision+1 WHERE id=p_case;
 INSERT INTO payment_review_notes(case_id,actor_user_id,action,reason) VALUES(p_case,p_actor,p_action,TRIM(p_reason));
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'PAYMENT_REVIEW_UPDATED','payment_review_cases',p_case,p_request,JSON_OBJECT('decision',p_action));COMMIT;
END$$
DELIMITER ;
