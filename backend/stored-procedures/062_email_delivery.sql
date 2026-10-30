DELIMITER $$
DROP PROCEDURE IF EXISTS sp_email_enqueue_deadline_reminders$$
CREATE PROCEDURE sp_email_enqueue_deadline_reminders()
SQL SECURITY INVOKER
BEGIN
 DECLARE v_now DATETIME(3) DEFAULT UTC_TIMESTAMP(3);

 INSERT IGNORE INTO email_outbox(id,recipient_user_id,dedupe_key,recipient_email,subject,body_text,target_path,source_type,source_id)
 SELECT UUID(),u.id,CONCAT('APPLICATION_DEADLINE:BRAND:',c.id,':',DATE_FORMAT(s.application_deadline,'%Y%m%d%H%i%s')),u.email,'Campaign application deadline approaching',CONCAT('Applications for ',c.title,' close within 24 hours.'),CONCAT('/brand/campaigns/',c.id,'/applicants'),'DEADLINE',c.id
 FROM campaigns c JOIN campaign_schedules s ON s.campaign_id=c.id JOIN brands b ON b.id=c.brand_id JOIN users u ON u.id=b.user_id
 WHERE c.status IN ('LIVE','PAUSED') AND s.application_deadline>v_now AND s.application_deadline<=DATE_ADD(v_now,INTERVAL 24 HOUR) AND u.status='ACTIVE';

 INSERT IGNORE INTO email_outbox(id,recipient_user_id,dedupe_key,recipient_email,subject,body_text,target_path,source_type,source_id)
 SELECT UUID(),u.id,CONCAT('APPLICATION_DEADLINE:CREATOR:',a.id,':',DATE_FORMAT(s.application_deadline,'%Y%m%d%H%i%s')),u.email,'Campaign application deadline approaching',CONCAT('Applications for ',c.title,' close within 24 hours.'),CONCAT('/creator/applications/',a.id),'DEADLINE',c.id
 FROM campaigns c JOIN campaign_schedules s ON s.campaign_id=c.id JOIN campaign_applications a ON a.campaign_id=c.id AND a.status IN ('PENDING','SHORTLISTED') JOIN creators cr ON cr.id=a.creator_id JOIN users u ON u.id=cr.user_id
 WHERE c.status IN ('LIVE','PAUSED') AND s.application_deadline>v_now AND s.application_deadline<=DATE_ADD(v_now,INTERVAL 24 HOUR) AND u.status='ACTIVE';

 INSERT IGNORE INTO email_outbox(id,recipient_user_id,dedupe_key,recipient_email,subject,body_text,target_path,source_type,source_id)
 SELECT UUID(),u.id,CONCAT('CONTENT_DEADLINE:',scope.recipient_kind,':',c.id,':',DATE_FORMAT(s.content_deadline,'%Y%m%d%H%i%s'),':',scope.recipient_ref),u.email,'Campaign content deadline approaching',CONCAT('Content for ',c.title,' is due within 24 hours.'),scope.target_path,'DEADLINE',c.id
 FROM campaigns c JOIN campaign_schedules s ON s.campaign_id=c.id
 JOIN (
  SELECT c1.id AS campaign_id,'BRAND' AS recipient_kind,c1.brand_id AS recipient_ref,b1.user_id,CONCAT('/brand/workspaces/',c1.id,'/submissions') AS target_path FROM campaigns c1 JOIN brands b1 ON b1.id=c1.brand_id
  UNION ALL
  SELECT a.campaign_id,'CREATOR',a.creator_id,cr.user_id,CONCAT('/creator/workspaces/',a.campaign_id,'/submissions') FROM campaign_creator_allocations a JOIN creators cr ON cr.id=a.creator_id JOIN campaign_applications app ON app.id=a.application_id AND app.status='APPROVED'
 ) scope ON scope.campaign_id=c.id JOIN users u ON u.id=scope.user_id
 WHERE c.status='IN_PROGRESS' AND s.content_deadline>v_now AND s.content_deadline<=DATE_ADD(v_now,INTERVAL 24 HOUR) AND u.status='ACTIVE';

 INSERT IGNORE INTO email_outbox(id,recipient_user_id,dedupe_key,recipient_email,subject,body_text,target_path,source_type,source_id)
 SELECT UUID(),u.id,CONCAT('CAMPAIGN_END:',scope.recipient_kind,':',c.id,':',DATE_FORMAT(s.end_at,'%Y%m%d%H%i%s'),':',scope.recipient_ref),u.email,'Campaign end date approaching',CONCAT(c.title,' is scheduled to end within 24 hours.'),scope.target_path,'DEADLINE',c.id
 FROM campaigns c JOIN campaign_schedules s ON s.campaign_id=c.id
 JOIN (
  SELECT c1.id AS campaign_id,'BRAND' AS recipient_kind,c1.brand_id AS recipient_ref,b1.user_id,CONCAT('/brand/campaigns/',c1.id,'/manage') AS target_path FROM campaigns c1 JOIN brands b1 ON b1.id=c1.brand_id
  UNION ALL
  SELECT a.campaign_id,'CREATOR',a.creator_id,cr.user_id,CONCAT('/creator/workspaces/',a.campaign_id) FROM campaign_creator_allocations a JOIN creators cr ON cr.id=a.creator_id JOIN campaign_applications app ON app.id=a.application_id AND app.status='APPROVED'
 ) scope ON scope.campaign_id=c.id JOIN users u ON u.id=scope.user_id
 WHERE c.status='IN_PROGRESS' AND s.end_at>v_now AND s.end_at<=DATE_ADD(v_now,INTERVAL 24 HOUR) AND u.status='ACTIVE';
END$$

DROP PROCEDURE IF EXISTS sp_email_outbox_claim$$
CREATE PROCEDURE sp_email_outbox_claim()
SQL SECURITY INVOKER
BEGIN
 DECLARE v_id CHAR(36) DEFAULT NULL;
 DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_id=NULL;
 START TRANSACTION;
 UPDATE email_outbox SET status='DEAD',locked_until=NULL,last_error_code='RETRY_LIMIT'
 WHERE status='SENDING' AND locked_until<=UTC_TIMESTAMP(3) AND attempts>=8;
 SELECT id INTO v_id FROM email_outbox
 WHERE attempts<8 AND ((status='PENDING' AND available_at<=UTC_TIMESTAMP(3)) OR (status='SENDING' AND locked_until<=UTC_TIMESTAMP(3)))
 ORDER BY available_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF v_id IS NOT NULL THEN
  UPDATE email_outbox SET status='SENDING',attempts=attempts+1,locked_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE),last_error_code=NULL WHERE id=v_id;
 END IF;
 COMMIT;
 IF v_id IS NOT NULL THEN
  SELECT id,recipient_email,subject,body_text,target_path,attempts FROM email_outbox WHERE id=v_id AND status='SENDING';
 END IF;
END$$

DROP PROCEDURE IF EXISTS sp_email_outbox_sent$$
CREATE PROCEDURE sp_email_outbox_sent(IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 UPDATE email_outbox SET status='SENT',sent_at=UTC_TIMESTAMP(3),locked_until=NULL,last_error_code=NULL WHERE id=p_id AND status='SENDING';
END$$

DROP PROCEDURE IF EXISTS sp_email_outbox_failed$$
CREATE PROCEDURE sp_email_outbox_failed(IN p_id CHAR(36),IN p_error_code VARCHAR(40))
SQL SECURITY INVOKER
BEGIN
 UPDATE email_outbox SET status=IF(attempts>=8,'DEAD','PENDING'),available_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL CASE attempts WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 15 WHEN 4 THEN 60 ELSE 360 END MINUTE),locked_until=NULL,last_error_code=LEFT(COALESCE(p_error_code,'DELIVERY_FAILED'),40)
 WHERE id=p_id AND status='SENDING';
END$$
DELIMITER ;
