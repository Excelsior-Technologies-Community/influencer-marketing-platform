DELIMITER $$
DROP PROCEDURE IF EXISTS sp_wallet_post_funding$$
CREATE PROCEDURE sp_wallet_post_funding(IN p_funding CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_owner CHAR(36);DECLARE v_campaign CHAR(36);DECLARE v_amount BIGINT UNSIGNED;DECLARE v_journal CHAR(36);DECLARE v_brand_account CHAR(36);DECLARE v_clearing CHAR(36);
 SELECT b.user_id,f.campaign_id,f.amount_minor INTO v_owner,v_campaign,v_amount FROM campaign_funding f JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id JOIN campaign_payment_attempts p ON BINARY p.provider_payment_id=BINARY f.captured_payment_id AND p.funding_id=f.id WHERE f.id=p_funding AND f.status='SUCCEEDED' AND f.currency='INR' AND p.status='CAPTURED' AND p.amount_minor=f.amount_minor AND p.currency=f.currency;
 IF v_owner IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
 IF EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=p_funding AND event_type='FUNDING_CAPTURE') THEN
  IF NOT EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=p_funding AND event_type='FUNDING_CAPTURE' AND status='POSTED' AND amount_minor=v_amount AND currency='INR' AND mode='TEST') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
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

