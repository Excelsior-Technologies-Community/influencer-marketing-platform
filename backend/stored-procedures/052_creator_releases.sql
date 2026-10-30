-- Append-only extension: one capture and one all-participant release per funding.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_upgrade_release_ledger$$
CREATE PROCEDURE sp_upgrade_release_ledger()
BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='wallet_accounts' AND CONSTRAINT_NAME='wallet_accounts_chk_2') THEN
 ALTER TABLE wallet_accounts DROP CHECK wallet_accounts_chk_2, ADD CONSTRAINT chk_wallet_account_kind CHECK((owner_user_id IS NULL AND account_type IN ('PROCESSOR_CLEARING','PLATFORM_COMMISSION')) OR (owner_user_id IS NOT NULL AND account_type IN ('BRAND_HELD','CREATOR_EARNINGS')));
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='wallet_journals' AND CONSTRAINT_NAME='wallet_journals_chk_2') THEN
 ALTER TABLE wallet_journals DROP CHECK wallet_journals_chk_2, ADD CONSTRAINT chk_wallet_event CHECK(event_type IN ('FUNDING_CAPTURE','CREATOR_RELEASE') AND currency='INR' AND mode='TEST');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wallet_journals' AND INDEX_NAME='uq_wallet_funding_event') THEN
 ALTER TABLE wallet_journals ADD UNIQUE KEY uq_wallet_funding_event(funding_id,event_type);
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wallet_journals' AND INDEX_NAME='funding_id') THEN
 ALTER TABLE wallet_journals DROP INDEX funding_id;
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='wallet_entries' AND CONSTRAINT_NAME='wallet_entries_chk_1') THEN
 ALTER TABLE wallet_entries DROP CHECK wallet_entries_chk_1, ADD CONSTRAINT chk_wallet_positive_entry CHECK(direction IN ('CREDIT','DEBIT') AND amount_minor BETWEEN 1 AND 99999999999);
 END IF;
END$$
CALL sp_upgrade_release_ledger()$$
DROP PROCEDURE sp_upgrade_release_ledger$$
CREATE TABLE IF NOT EXISTS creator_payment_releases (
 journal_id CHAR(36) NOT NULL,application_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 gross_minor BIGINT UNSIGNED NOT NULL,commission_minor BIGINT UNSIGNED NOT NULL,net_minor BIGINT UNSIGNED NOT NULL,
 commission_bps INT NOT NULL DEFAULT 1000,allocation_order INT NOT NULL,
 PRIMARY KEY(application_id),UNIQUE KEY uq_release_order(journal_id,allocation_order),
 FOREIGN KEY(journal_id) REFERENCES wallet_journals(id),FOREIGN KEY(application_id) REFERENCES campaign_creator_allocations(application_id),FOREIGN KEY(user_id) REFERENCES users(id),
 CHECK(gross_minor>0 AND commission_bps=1000 AND commission_minor=FLOOR(gross_minor/10) AND net_minor=gross_minor-commission_minor AND net_minor>0)
) ENGINE=InnoDB$$
CREATE OR REPLACE VIEW campaign_release_plan AS
SELECT ranked.*,CAST(FLOOR(amount_minor/participant_count)+(allocation_order<=MOD(amount_minor,participant_count)) AS UNSIGNED) AS gross_minor
FROM (SELECT f.id AS funding_id,f.campaign_id,f.amount_minor,x.application_id,cr.user_id,u.name AS creator_name,
 ROW_NUMBER() OVER(PARTITION BY f.id ORDER BY x.allocated_at,x.application_id) AS allocation_order,
 COUNT(*) OVER(PARTITION BY f.id) AS participant_count
 FROM campaign_funding f JOIN campaign_creator_allocations x ON x.campaign_id=f.campaign_id JOIN campaign_applications a ON a.id=x.application_id AND a.status='APPROVED' JOIN creators cr ON cr.id=x.creator_id JOIN users u ON u.id=cr.user_id) ranked$$
DROP TRIGGER IF EXISTS release_details_insert_guard$$
CREATE TRIGGER release_details_insert_guard BEFORE INSERT ON creator_payment_releases FOR EACH ROW
BEGIN
 IF NOT EXISTS(SELECT 1 FROM wallet_journals j JOIN campaign_release_plan p ON p.funding_id=j.funding_id WHERE j.id=NEW.journal_id AND j.status='DRAFT' AND j.event_type='CREATOR_RELEASE' AND p.application_id=NEW.application_id AND p.user_id=NEW.user_id AND p.gross_minor=NEW.gross_minor AND p.allocation_order=NEW.allocation_order) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
END$$
DROP TRIGGER IF EXISTS release_details_no_update$$
CREATE TRIGGER release_details_no_update BEFORE UPDATE ON creator_payment_releases FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE'$$
DROP TRIGGER IF EXISTS release_details_no_delete$$
CREATE TRIGGER release_details_no_delete BEFORE DELETE ON creator_payment_releases FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE'$$
DROP TRIGGER IF EXISTS wallet_journals_post_guard$$
CREATE TRIGGER wallet_journals_post_guard BEFORE UPDATE ON wallet_journals FOR EACH ROW
BEGIN
 DECLARE v_count INT;DECLARE v_fee BIGINT UNSIGNED;
 IF OLD.status='POSTED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_IMMUTABLE';END IF;
 IF NEW.id<>OLD.id OR NEW.funding_id<>OLD.funding_id OR NEW.event_type<>OLD.event_type OR NEW.amount_minor<>OLD.amount_minor OR NEW.currency<>OLD.currency OR NEW.mode<>OLD.mode THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
 IF NEW.status='POSTED' THEN
  IF NEW.posted_at IS NULL OR (SELECT COALESCE(SUM(amount_minor),0) FROM wallet_entries WHERE journal_id=OLD.id AND direction='DEBIT')<>NEW.amount_minor OR (SELECT COALESCE(SUM(amount_minor),0) FROM wallet_entries WHERE journal_id=OLD.id AND direction='CREDIT')<>NEW.amount_minor THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
  IF NEW.event_type='FUNDING_CAPTURE' THEN
   IF (SELECT COUNT(*) FROM wallet_entries WHERE journal_id=OLD.id)<>2
   OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id JOIN campaign_funding f ON f.id=NEW.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id JOIN campaign_payment_attempts p ON BINARY p.provider_payment_id=BINARY f.captured_payment_id AND p.funding_id=f.id WHERE e.journal_id=OLD.id AND e.direction='CREDIT' AND a.account_type='BRAND_HELD' AND a.owner_user_id=b.user_id AND a.currency=NEW.currency AND a.mode=NEW.mode AND f.status='SUCCEEDED' AND f.amount_minor=NEW.amount_minor AND f.currency=NEW.currency AND p.status='CAPTURED' AND p.amount_minor=f.amount_minor AND p.currency=f.currency)
   OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=OLD.id AND e.direction='DEBIT' AND a.owner_user_id IS NULL AND a.account_code='RAZORPAY_TEST_CLEARING_INR' AND a.account_type='PROCESSOR_CLEARING' AND a.currency=NEW.currency AND a.mode=NEW.mode)
   THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
  ELSE
   SELECT COUNT(*),COALESCE(SUM(commission_minor),0) INTO v_count,v_fee FROM creator_payment_releases WHERE journal_id=OLD.id;
   IF v_count=0 OR (SELECT COUNT(*) FROM wallet_entries WHERE journal_id=OLD.id)<>v_count+1+(v_fee>0)
   OR NOT EXISTS(SELECT 1 FROM campaign_funding f JOIN campaign_content_progress c ON c.id=f.campaign_id JOIN wallet_journals capture ON capture.funding_id=f.id AND capture.event_type='FUNDING_CAPTURE' AND capture.status='POSTED' WHERE f.id=NEW.funding_id AND f.status='SUCCEEDED' AND f.amount_minor=NEW.amount_minor AND capture.amount_minor=NEW.amount_minor AND c.status='COMPLETED' AND c.allocatedSlots=c.creatorSlots AND c.itemsPerCreator>0 AND c.approvedItems=c.creatorSlots*c.itemsPerCreator AND c.creatorSlots=v_count)
   OR (SELECT COALESCE(SUM(gross_minor),0) FROM creator_payment_releases WHERE journal_id=OLD.id)<>NEW.amount_minor
   OR EXISTS(SELECT 1 FROM creator_payment_releases r LEFT JOIN wallet_accounts a ON a.owner_user_id=r.user_id AND a.account_type='CREATOR_EARNINGS' AND a.currency=NEW.currency AND a.mode=NEW.mode LEFT JOIN wallet_entries e ON e.journal_id=OLD.id AND e.account_id=a.id AND e.direction='CREDIT' AND e.amount_minor=r.net_minor WHERE r.journal_id=OLD.id AND e.id IS NULL)
   OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id JOIN campaign_funding f ON f.id=NEW.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id WHERE e.journal_id=OLD.id AND e.direction='DEBIT' AND e.amount_minor=NEW.amount_minor AND a.account_type='BRAND_HELD' AND a.owner_user_id=b.user_id)
   OR (v_fee>0 AND NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=OLD.id AND e.direction='CREDIT' AND e.amount_minor=v_fee AND a.owner_user_id IS NULL AND a.account_type='PLATFORM_COMMISSION' AND a.account_code='PLATFORM_COMMISSION_INR_TEST'))
   THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;
  END IF;
 END IF;
END$$
DROP PROCEDURE IF EXISTS sp_release_creator_payment$$
CREATE PROCEDURE sp_release_creator_payment(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_status VARCHAR(32);DECLARE v_revision INT;DECLARE v_funding CHAR(36);DECLARE v_amount BIGINT UNSIGNED;DECLARE v_journal CHAR(36);DECLARE v_account CHAR(36);DECLARE v_fee BIGINT UNSIGNED;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_assert(p_actor,v_brand);
 SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_campaign AND brand_id=v_brand FOR UPDATE;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 SELECT id,amount_minor INTO v_funding,v_amount FROM campaign_funding WHERE campaign_id=p_campaign AND status='SUCCEEDED' FOR UPDATE;
 IF v_funding IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RELEASE_BLOCKED';END IF;
 IF NOT EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=v_funding AND event_type='CREATOR_RELEASE') THEN
  IF v_status<>'COMPLETED' OR NOT EXISTS(SELECT 1 FROM campaign_content_progress WHERE id=p_campaign AND allocatedSlots=creatorSlots AND itemsPerCreator>0 AND approvedItems=creatorSlots*itemsPerCreator)
  OR NOT EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=v_funding AND event_type='FUNDING_CAPTURE' AND status='POSTED' AND amount_minor=v_amount)
  OR EXISTS(SELECT 1 FROM campaign_release_plan p JOIN users u ON u.id=p.user_id WHERE p.campaign_id=p_campaign AND (u.status<>'ACTIVE' OR p.gross_minor<1)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RELEASE_BLOCKED';END IF;
  SET v_journal=UUID();
  INSERT INTO wallet_journals(id,funding_id,event_type,amount_minor) VALUES(v_journal,v_funding,'CREATOR_RELEASE',v_amount);
  INSERT INTO creator_payment_releases(journal_id,application_id,user_id,gross_minor,commission_minor,net_minor,allocation_order) SELECT v_journal,application_id,user_id,gross_minor,FLOOR(gross_minor/10),gross_minor-FLOOR(gross_minor/10),allocation_order FROM campaign_release_plan WHERE funding_id=v_funding;
  INSERT INTO wallet_accounts(id,owner_user_id,account_code,account_type) SELECT UUID(),r.user_id,CONCAT('USER:',r.user_id,':INR:TEST'),'CREATOR_EARNINGS' FROM creator_payment_releases r WHERE r.journal_id=v_journal AND NOT EXISTS(SELECT 1 FROM wallet_accounts a WHERE a.owner_user_id=r.user_id AND a.currency='INR' AND a.mode='TEST');
  SELECT id INTO v_account FROM wallet_accounts WHERE owner_user_id=p_actor AND account_type='BRAND_HELD' AND currency='INR' AND mode='TEST';
  INSERT INTO wallet_entries(journal_id,account_id,direction,amount_minor) VALUES(v_journal,v_account,'DEBIT',v_amount);
  INSERT INTO wallet_entries(journal_id,account_id,direction,amount_minor) SELECT v_journal,a.id,'CREDIT',r.net_minor FROM creator_payment_releases r JOIN wallet_accounts a ON a.owner_user_id=r.user_id AND a.account_type='CREATOR_EARNINGS' AND a.currency='INR' AND a.mode='TEST' WHERE r.journal_id=v_journal;
  SELECT COALESCE(SUM(commission_minor),0) INTO v_fee FROM creator_payment_releases WHERE journal_id=v_journal;
  IF v_fee>0 THEN
   IF NOT EXISTS(SELECT 1 FROM wallet_accounts WHERE account_code='PLATFORM_COMMISSION_INR_TEST') THEN INSERT INTO wallet_accounts(id,account_code,account_type) VALUES(UUID(),'PLATFORM_COMMISSION_INR_TEST','PLATFORM_COMMISSION');END IF;
   SELECT id INTO v_account FROM wallet_accounts WHERE account_code='PLATFORM_COMMISSION_INR_TEST';
   INSERT INTO wallet_entries(journal_id,account_id,direction,amount_minor) VALUES(v_journal,v_account,'CREDIT',v_fee);
  END IF;
  UPDATE wallet_journals SET status='POSTED',posted_at=UTC_TIMESTAMP(6) WHERE id=v_journal;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CREATOR_EARNINGS_RELEASED','campaigns',p_campaign,p_request,JSON_OBJECT('journalId',v_journal,'mode','TEST','commissionBps',1000));
 ELSEIF NOT EXISTS(SELECT 1 FROM wallet_journals WHERE funding_id=v_funding AND event_type='CREATOR_RELEASE' AND status='POSTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';
 END IF;
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_creator_release_preview$$
CREATE PROCEDURE sp_creator_release_preview(IN p_actor CHAR(36),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_actor(p_actor,'BRAND_ADMIN');
 IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_campaign AND b.user_id=p_actor) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT c.id AS campaignId,c.revision,c.status,1000 AS commissionBps,'TEST' AS mode,'INR' AS currency,j.id AS journalId,j.posted_at AS releasedAt,
 (j.status='POSTED') AS released,
 (j.id IS NULL AND c.status='COMPLETED' AND c.allocatedSlots=c.creatorSlots AND c.itemsPerCreator>0 AND c.approvedItems=c.creatorSlots*c.itemsPerCreator AND f.status='SUCCEEDED' AND EXISTS(SELECT 1 FROM wallet_journals capture WHERE capture.funding_id=f.id AND capture.event_type='FUNDING_CAPTURE' AND capture.status='POSTED') AND NOT EXISTS(SELECT 1 FROM campaign_release_plan p JOIN users u ON u.id=p.user_id WHERE p.campaign_id=c.id AND (u.status<>'ACTIVE' OR p.gross_minor<1))) AS canRelease
 FROM campaign_content_progress c LEFT JOIN campaign_funding f ON f.campaign_id=c.id LEFT JOIN wallet_journals j ON j.funding_id=f.id AND j.event_type='CREATOR_RELEASE' WHERE c.id=p_campaign;
 IF EXISTS(SELECT 1 FROM wallet_journals j JOIN campaign_funding f ON f.id=j.funding_id WHERE f.campaign_id=p_campaign AND j.event_type='CREATOR_RELEASE' AND j.status='POSTED') THEN
 SELECT r.application_id AS applicationId,u.name AS creatorName,CAST(r.gross_minor AS CHAR) AS grossMinor,CAST(r.commission_minor AS CHAR) AS commissionMinor,CAST(r.net_minor AS CHAR) AS netMinor FROM creator_payment_releases r JOIN wallet_journals j ON j.id=r.journal_id JOIN campaign_funding f ON f.id=j.funding_id JOIN users u ON u.id=r.user_id WHERE f.campaign_id=p_campaign ORDER BY r.allocation_order;
 ELSE
 SELECT application_id AS applicationId,creator_name AS creatorName,CAST(gross_minor AS CHAR) AS grossMinor,CAST(FLOOR(gross_minor/10) AS CHAR) AS commissionMinor,CAST(gross_minor-FLOOR(gross_minor/10) AS CHAR) AS netMinor FROM campaign_release_plan WHERE campaign_id=p_campaign ORDER BY allocation_order;
 END IF;
 COMMIT;
 END;
END$$
DELIMITER ;
