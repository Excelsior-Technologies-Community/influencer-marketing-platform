CREATE TABLE IF NOT EXISTS in_app_notifications (
 id CHAR(36) PRIMARY KEY,
 recipient_user_id CHAR(36) NOT NULL,
 event_key VARCHAR(240) NOT NULL,
 event_type VARCHAR(40) NOT NULL,
 title VARCHAR(120) NOT NULL,
 body VARCHAR(500) NOT NULL,
 target_path VARCHAR(255) NOT NULL,
 entity_type VARCHAR(40) NOT NULL,
 entity_id CHAR(36) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 read_at TIMESTAMP(6) NULL,
 UNIQUE KEY uq_in_app_notification_event(recipient_user_id,event_key),
 CONSTRAINT fk_in_app_notification_user FOREIGN KEY(recipient_user_id) REFERENCES users(id),
 CONSTRAINT chk_in_app_notification_type CHECK(event_type IN ('APPLICATION_SUBMITTED','APPLICATION_STATUS','APPLICATION_WITHDRAWN','CONTENT_SUBMITTED','CONTENT_REVIEWED','FUNDING_SUCCEEDED','FUNDING_FAILED','CREATOR_EARNINGS_RELEASED','BRAND_EARNINGS_RELEASED','REFUND_STATUS','PAYMENT_REVIEW_REQUIRED')),
 CONSTRAINT chk_in_app_notification_path CHECK(target_path LIKE '/%' AND target_path NOT LIKE '//%'),
 INDEX idx_in_app_notifications_inbox(recipient_user_id,created_at,id),
 INDEX idx_in_app_notifications_unread(recipient_user_id,read_at,created_at,id)
) ENGINE=InnoDB;

DELIMITER $$
DROP TRIGGER IF EXISTS app_notification_application_insert$$
CREATE TRIGGER app_notification_application_insert AFTER INSERT ON campaign_applications
FOR EACH ROW
BEGIN
 INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
 SELECT UUID(),b.user_id,CONCAT('APPLICATION_SUBMITTED:',NEW.id),'APPLICATION_SUBMITTED','New Creator application',CONCAT(creator.name,' applied to ',c.title,'.'),CONCAT('/brand/campaigns/',c.id,'/applicants'),'CAMPAIGN_APPLICATION',NEW.id
 FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN creators cr ON cr.id=NEW.creator_id JOIN users creator ON creator.id=cr.user_id WHERE c.id=NEW.campaign_id;
END$$

DROP TRIGGER IF EXISTS app_notification_application_update$$
CREATE TRIGGER app_notification_application_update AFTER UPDATE ON campaign_applications
FOR EACH ROW
BEGIN
 IF NEW.status<>OLD.status AND NEW.status IN ('SHORTLISTED','APPROVED','REJECTED') THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),creator.id,CONCAT('APPLICATION_STATUS:',NEW.id,':',NEW.revision),'APPLICATION_STATUS',
   CASE NEW.status WHEN 'SHORTLISTED' THEN 'You were shortlisted' WHEN 'APPROVED' THEN 'Application approved' ELSE 'Application not selected' END,
   CONCAT('Your application for ',c.title,' is now ',LOWER(REPLACE(NEW.status,'_',' ')),'.'),CONCAT('/creator/applications/',NEW.id),'CAMPAIGN_APPLICATION',NEW.id
  FROM campaigns c JOIN creators cr ON cr.id=NEW.creator_id JOIN users creator ON creator.id=cr.user_id WHERE c.id=NEW.campaign_id;
 ELSEIF NEW.status<>OLD.status AND NEW.status='WITHDRAWN' THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),b.user_id,CONCAT('APPLICATION_WITHDRAWN:',NEW.id,':',NEW.revision),'APPLICATION_WITHDRAWN','Creator withdrew an application',CONCAT(creator.name,' withdrew from ',c.title,'.'),CONCAT('/brand/campaigns/',c.id,'/applicants'),'CAMPAIGN_APPLICATION',NEW.id
  FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN creators cr ON cr.id=NEW.creator_id JOIN users creator ON creator.id=cr.user_id WHERE c.id=NEW.campaign_id;
 END IF;
END$$

DROP TRIGGER IF EXISTS app_notification_content_insert$$
CREATE TRIGGER app_notification_content_insert AFTER INSERT ON content_submissions
FOR EACH ROW
BEGIN
 INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
 SELECT UUID(),b.user_id,CONCAT('CONTENT_SUBMITTED:',NEW.id,':',NEW.version),'CONTENT_SUBMITTED','New content submitted',CONCAT(creator.name,' submitted content for ',c.title,'.'),CONCAT('/brand/workspaces/',c.id,'/submissions'),'CONTENT_SUBMISSION',NEW.id
 FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN campaign_applications a ON a.id=NEW.application_id JOIN creators cr ON cr.id=a.creator_id JOIN users creator ON creator.id=cr.user_id WHERE c.id=NEW.campaign_id;
END$$

DROP TRIGGER IF EXISTS app_notification_content_update$$
CREATE TRIGGER app_notification_content_update AFTER UPDATE ON content_submissions
FOR EACH ROW
BEGIN
 IF NEW.status='SUBMITTED' AND (OLD.status<>'SUBMITTED' OR NEW.version<>OLD.version) THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),b.user_id,CONCAT('CONTENT_SUBMITTED:',NEW.id,':',NEW.version),'CONTENT_SUBMITTED','Updated content is ready',CONCAT(creator.name,' submitted version ',NEW.version,' for ',c.title,'.'),CONCAT('/brand/workspaces/',c.id,'/submissions'),'CONTENT_SUBMISSION',NEW.id
  FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN campaign_applications a ON a.id=NEW.application_id JOIN creators cr ON cr.id=a.creator_id JOIN users creator ON creator.id=cr.user_id WHERE c.id=NEW.campaign_id;
 ELSEIF NEW.status<>OLD.status AND NEW.status IN ('APPROVED','REJECTED','REVISION_REQUESTED') THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),creator.id,CONCAT('CONTENT_REVIEWED:',NEW.id,':',NEW.version,':',NEW.status),'CONTENT_REVIEWED',
   CASE NEW.status WHEN 'APPROVED' THEN 'Content approved' WHEN 'REJECTED' THEN 'Content rejected' ELSE 'Changes requested' END,
   CONCAT('The Brand ',LOWER(REPLACE(NEW.status,'_',' ')),' your content for ',c.title,'.'),CONCAT('/creator/workspaces/',c.id,'/submissions'),'CONTENT_SUBMISSION',NEW.id
  FROM campaigns c JOIN campaign_applications a ON a.id=NEW.application_id JOIN creators cr ON cr.id=a.creator_id JOIN users creator ON creator.id=cr.user_id WHERE c.id=NEW.campaign_id;
 END IF;
END$$

DROP TRIGGER IF EXISTS app_notification_payment_attempt_insert$$
CREATE TRIGGER app_notification_payment_attempt_insert AFTER INSERT ON campaign_payment_attempts
FOR EACH ROW
BEGIN
 IF NEW.status='FAILED' THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),b.user_id,CONCAT('FUNDING_FAILED:',NEW.provider_payment_id),'FUNDING_FAILED','Test payment failed',CONCAT('A Test Mode funding attempt for ',c.title,' failed. You can check its status and try again.'),CONCAT('/brand/campaigns/',c.id,'/funding'),'CAMPAIGN_FUNDING',c.id
  FROM campaign_funding f JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id WHERE f.id=NEW.funding_id;
 END IF;
END$$

DROP TRIGGER IF EXISTS app_notification_payment_attempt_update$$
CREATE TRIGGER app_notification_payment_attempt_update AFTER UPDATE ON campaign_payment_attempts
FOR EACH ROW
BEGIN
 IF NEW.status='FAILED' AND OLD.status<>'FAILED' THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),b.user_id,CONCAT('FUNDING_FAILED:',NEW.provider_payment_id),'FUNDING_FAILED','Test payment failed',CONCAT('A Test Mode funding attempt for ',c.title,' failed. You can check its status and try again.'),CONCAT('/brand/campaigns/',c.id,'/funding'),'CAMPAIGN_FUNDING',c.id
  FROM campaign_funding f JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id WHERE f.id=NEW.funding_id;
 END IF;
END$$

DROP TRIGGER IF EXISTS app_notification_funding_update$$
CREATE TRIGGER app_notification_funding_update AFTER UPDATE ON campaign_funding
FOR EACH ROW
BEGIN
 IF NEW.status='SUCCEEDED' AND OLD.status<>'SUCCEEDED' THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),b.user_id,CONCAT('FUNDING_SUCCEEDED:',NEW.id),'FUNDING_SUCCEEDED','Campaign funded',CONCAT('Test Mode funding for ',c.title,' was confirmed.'),CONCAT('/brand/campaigns/',c.id,'/funding'),'CAMPAIGN_FUNDING',c.id
  FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=NEW.campaign_id;
 END IF;
END$$

DROP TRIGGER IF EXISTS app_notification_wallet_release$$
CREATE TRIGGER app_notification_wallet_release AFTER UPDATE ON wallet_journals
FOR EACH ROW
BEGIN
 IF NEW.status='POSTED' AND OLD.status<>'POSTED' AND NEW.event_type='CREATOR_RELEASE' THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),r.user_id,CONCAT('CREATOR_EARNINGS_RELEASED:',NEW.id,':',r.user_id),'CREATOR_EARNINGS_RELEASED','Earnings added to your test wallet',CONCAT('Creator earnings for ',c.title,' were released to your test wallet.'),'/creator/wallet','CREATOR_PAYMENT_RELEASE',r.application_id
  FROM creator_payment_releases r JOIN campaign_funding f ON f.id=NEW.funding_id JOIN campaigns c ON c.id=f.campaign_id WHERE r.journal_id=NEW.id;
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),b.user_id,CONCAT('BRAND_EARNINGS_RELEASED:',NEW.id),'BRAND_EARNINGS_RELEASED','Creator earnings released',CONCAT('Creator test-wallet earnings for ',c.title,' were released.'),CONCAT('/brand/campaigns/',c.id,'/earnings-release'),'CAMPAIGN_FUNDING',c.id
  FROM campaign_funding f JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id WHERE f.id=NEW.funding_id;
 END IF;
END$$

DROP TRIGGER IF EXISTS app_notification_refund_update$$
CREATE TRIGGER app_notification_refund_update AFTER UPDATE ON campaign_refunds
FOR EACH ROW
BEGIN
 IF NEW.status<>OLD.status AND NEW.status IN ('SETUP_REVIEW','PENDING','PROCESSED','FAILED') THEN
  INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
  SELECT UUID(),b.user_id,CONCAT('REFUND_STATUS:',NEW.id,':',NEW.status),'REFUND_STATUS',
   CASE NEW.status WHEN 'PROCESSED' THEN 'Refund processed' WHEN 'FAILED' THEN 'Refund needs attention' WHEN 'PENDING' THEN 'Refund pending' ELSE 'Refund status needs review' END,
   CONCAT('The Test Mode refund for ',c.title,' is now ',LOWER(REPLACE(NEW.status,'_',' ')),'.'),CONCAT('/brand/campaigns/',c.id,'/refunds'),'CAMPAIGN_REFUND',NEW.id
  FROM campaign_funding f JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id WHERE f.id=NEW.funding_id;
 END IF;
END$$

DROP TRIGGER IF EXISTS app_notification_payment_review_insert$$
CREATE TRIGGER app_notification_payment_review_insert AFTER INSERT ON payment_review_cases
FOR EACH ROW
BEGIN
 INSERT IGNORE INTO in_app_notifications(id,recipient_user_id,event_key,event_type,title,body,target_path,entity_type,entity_id)
 SELECT UUID(),admin.id,CONCAT('PAYMENT_REVIEW_REQUIRED:',NEW.id,':',admin.id),'PAYMENT_REVIEW_REQUIRED','Payment review needs attention',CONCAT('A payment exception for ',c.title,' needs Super Admin review.'),'/admin/payment-reviews','PAYMENT_REVIEW_CASE',NEW.id
 FROM campaign_funding f JOIN campaigns c ON c.id=f.campaign_id CROSS JOIN users admin JOIN roles role ON role.id=admin.role_id AND role.code='SUPER_ADMIN' AND admin.status='ACTIVE'
 WHERE f.id=NEW.funding_id;
END$$

DROP TRIGGER IF EXISTS in_app_notifications_one_way_read$$
CREATE TRIGGER in_app_notifications_one_way_read BEFORE UPDATE ON in_app_notifications
FOR EACH ROW
BEGIN
 IF OLD.id<>NEW.id OR OLD.recipient_user_id<>NEW.recipient_user_id OR OLD.event_key<>NEW.event_key OR OLD.event_type<>NEW.event_type OR OLD.title<>NEW.title OR OLD.body<>NEW.body OR OLD.target_path<>NEW.target_path OR OLD.entity_type<>NEW.entity_type OR OLD.entity_id<>NEW.entity_id OR OLD.created_at<>NEW.created_at OR OLD.read_at IS NOT NULL OR NEW.read_at IS NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='NOTIFICATION_IMMUTABLE';
 END IF;
END$$
DROP TRIGGER IF EXISTS in_app_notifications_no_delete$$
CREATE TRIGGER in_app_notifications_no_delete BEFORE DELETE ON in_app_notifications
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='NOTIFICATION_IMMUTABLE';
END$$
DELIMITER ;
