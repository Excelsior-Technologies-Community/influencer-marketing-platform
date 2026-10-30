DELIMITER $$
DROP TRIGGER IF EXISTS wallet_accounts_no_update$$
CREATE TRIGGER wallet_accounts_no_update BEFORE UPDATE ON wallet_accounts FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE'$$
DROP TRIGGER IF EXISTS wallet_entries_insert_guard$$
CREATE TRIGGER wallet_entries_insert_guard BEFORE INSERT ON wallet_entries FOR EACH ROW
BEGIN
 IF NOT EXISTS(SELECT 1 FROM wallet_journals j JOIN wallet_accounts a ON a.id=NEW.account_id WHERE j.id=NEW.journal_id AND j.status='DRAFT' AND j.currency=a.currency AND j.mode=a.mode) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE';END IF;
END$$
DROP TRIGGER IF EXISTS wallet_entries_no_update$$
CREATE TRIGGER wallet_entries_no_update BEFORE UPDATE ON wallet_entries FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE'$$
DROP TRIGGER IF EXISTS wallet_entries_delete_guard$$
CREATE TRIGGER wallet_entries_delete_guard BEFORE DELETE ON wallet_entries FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM wallet_journals WHERE id=OLD.journal_id AND status='POSTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE';END IF;
END$$
DROP TRIGGER IF EXISTS wallet_journals_insert_guard$$
CREATE TRIGGER wallet_journals_insert_guard BEFORE INSERT ON wallet_journals FOR EACH ROW
BEGIN
 IF NEW.status<>'DRAFT' OR NEW.posted_at IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
END$$
DROP TRIGGER IF EXISTS wallet_journals_post_guard$$
CREATE TRIGGER wallet_journals_post_guard BEFORE UPDATE ON wallet_journals FOR EACH ROW
BEGIN
 IF OLD.status='POSTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE';END IF;
 IF NEW.id<>OLD.id OR NEW.funding_id<>OLD.funding_id OR NEW.event_type<>OLD.event_type OR NEW.amount_minor<>OLD.amount_minor OR NEW.currency<>OLD.currency OR NEW.mode<>OLD.mode THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
 IF NEW.status='POSTED' THEN
  IF NEW.posted_at IS NULL OR (SELECT COUNT(*) FROM wallet_entries WHERE journal_id=OLD.id)<>2
  OR (SELECT COALESCE(SUM(amount_minor),0) FROM wallet_entries WHERE journal_id=OLD.id AND direction='DEBIT')<>NEW.amount_minor
  OR (SELECT COALESCE(SUM(amount_minor),0) FROM wallet_entries WHERE journal_id=OLD.id AND direction='CREDIT')<>NEW.amount_minor
  OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id JOIN campaign_funding f ON f.id=NEW.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id JOIN campaign_payment_attempts p ON BINARY p.provider_payment_id=BINARY f.captured_payment_id AND p.funding_id=f.id WHERE e.journal_id=OLD.id AND e.direction='CREDIT' AND a.account_type='BRAND_HELD' AND a.owner_user_id=b.user_id AND a.currency=NEW.currency AND a.mode=NEW.mode AND f.status='SUCCEEDED' AND f.amount_minor=NEW.amount_minor AND f.currency=NEW.currency AND p.status='CAPTURED' AND p.amount_minor=f.amount_minor AND p.currency=f.currency)
  OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=OLD.id AND e.direction='DEBIT' AND a.owner_user_id IS NULL AND a.account_code='RAZORPAY_TEST_CLEARING_INR' AND a.account_type='PROCESSOR_CLEARING' AND a.currency=NEW.currency AND a.mode=NEW.mode)
  THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
 END IF;
END$$
DROP TRIGGER IF EXISTS wallet_journals_delete_guard$$
CREATE TRIGGER wallet_journals_delete_guard BEFORE DELETE ON wallet_journals FOR EACH ROW
BEGIN
 IF OLD.status='POSTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE';END IF;
END$$
DROP TRIGGER IF EXISTS wallet_funding_update_guard$$
CREATE TRIGGER wallet_funding_update_guard BEFORE UPDATE ON campaign_funding FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=OLD.id AND status='POSTED') AND
 (NEW.id<>OLD.id OR NEW.campaign_id<>OLD.campaign_id OR NEW.amount_minor<>OLD.amount_minor OR NEW.currency<>OLD.currency OR NEW.provider_key_id<>OLD.provider_key_id OR NOT(BINARY NEW.provider_order_id<=>BINARY OLD.provider_order_id) OR NOT(BINARY NEW.captured_payment_id<=>BINARY OLD.captured_payment_id) OR NEW.status<>'SUCCEEDED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE';END IF;
END$$
DROP TRIGGER IF EXISTS wallet_capture_update_guard$$
CREATE TRIGGER wallet_capture_update_guard BEFORE UPDATE ON campaign_payment_attempts FOR EACH ROW
BEGIN
 IF OLD.status='CAPTURED' AND EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=OLD.funding_id AND status='POSTED') AND
 (BINARY NEW.provider_payment_id<>BINARY OLD.provider_payment_id OR NEW.funding_id<>OLD.funding_id OR NEW.status<>'CAPTURED' OR NEW.amount_minor<>OLD.amount_minor OR NEW.currency<>OLD.currency) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE';END IF;
END$$
DROP TRIGGER IF EXISTS wallet_capture_delete_guard$$
CREATE TRIGGER wallet_capture_delete_guard BEFORE DELETE ON campaign_payment_attempts FOR EACH ROW
BEGIN
 IF OLD.status='CAPTURED' AND EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=OLD.funding_id AND status='POSTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE';END IF;
END$$

-- Internal helper: caller owns the shared role/funding locks and transaction.
DROP PROCEDURE IF EXISTS sp_wallet_post_funding$$
CREATE PROCEDURE sp_wallet_post_funding(IN p_funding CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_owner CHAR(36);DECLARE v_campaign CHAR(36);DECLARE v_amount BIGINT UNSIGNED;DECLARE v_journal CHAR(36);DECLARE v_brand_account CHAR(36);DECLARE v_clearing CHAR(36);
 SELECT b.user_id,f.campaign_id,f.amount_minor INTO v_owner,v_campaign,v_amount FROM campaign_funding f JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id JOIN campaign_payment_attempts p ON BINARY p.provider_payment_id=BINARY f.captured_payment_id AND p.funding_id=f.id WHERE f.id=p_funding AND f.status='SUCCEEDED' AND f.currency='INR' AND p.status='CAPTURED' AND p.amount_minor=f.amount_minor AND p.currency=f.currency;
 IF v_owner IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
 IF EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=p_funding) THEN
  IF NOT EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=p_funding AND status='POSTED' AND amount_minor=v_amount AND currency='INR' AND mode='TEST') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM wallet_accounts WHERE owner_user_id=v_owner AND currency='INR' AND mode='TEST') THEN
   INSERT INTO wallet_accounts(id,owner_user_id,account_code,account_type) VALUES(UUID(),v_owner,CONCAT('USER:',v_owner,':INR:TEST'),'BRAND_HELD');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM wallet_accounts WHERE account_code='RAZORPAY_TEST_CLEARING_INR') THEN
   INSERT INTO wallet_accounts(id,owner_user_id,account_code,account_type) VALUES(UUID(),NULL,'RAZORPAY_TEST_CLEARING_INR','PROCESSOR_CLEARING');
  END IF;
  SELECT id INTO v_brand_account FROM wallet_accounts WHERE owner_user_id=v_owner AND currency='INR' AND mode='TEST' AND account_type='BRAND_HELD';
  SELECT id INTO v_clearing FROM wallet_accounts WHERE account_code='RAZORPAY_TEST_CLEARING_INR' AND account_type='PROCESSOR_CLEARING' AND owner_user_id IS NULL;
  IF v_brand_account IS NULL OR v_clearing IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
  SET v_journal=UUID();
  INSERT INTO wallet_journals(id,funding_id,amount_minor) VALUES(v_journal,p_funding,v_amount);
  INSERT INTO wallet_entries(journal_id,account_id,direction,amount_minor) VALUES(v_journal,v_brand_account,'CREDIT',v_amount),(v_journal,v_clearing,'DEBIT',v_amount);
  UPDATE wallet_journals SET status='POSTED',posted_at=UTC_TIMESTAMP(6) WHERE id=v_journal;
  INSERT INTO audit_logs(action,entity_type,entity_id,request_id,metadata) VALUES('WALLET_FUNDING_POSTED','campaigns',v_campaign,p_request,JSON_OBJECT('journalId',v_journal,'mode','TEST'));
 END IF;
END$$
DELIMITER ;
