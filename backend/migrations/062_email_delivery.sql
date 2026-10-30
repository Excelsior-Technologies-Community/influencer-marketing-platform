CREATE TABLE IF NOT EXISTS email_outbox (
 id CHAR(36) PRIMARY KEY,
 recipient_user_id CHAR(36) NOT NULL,
 notification_id CHAR(36) NULL,
 dedupe_key VARCHAR(240) NOT NULL,
 recipient_email VARCHAR(254) NOT NULL,
 subject VARCHAR(180) NOT NULL,
 body_text TEXT NOT NULL,
 target_path VARCHAR(255) NOT NULL,
 source_type VARCHAR(32) NOT NULL,
 source_id CHAR(36) NOT NULL,
 status ENUM('PENDING','SENDING','SENT','DEAD') NOT NULL DEFAULT 'PENDING',
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 locked_until DATETIME(3) NULL,
 sent_at DATETIME(3) NULL,
 last_error_code VARCHAR(40) NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_email_outbox_recipient_event(recipient_user_id,dedupe_key),
 UNIQUE KEY uq_email_outbox_notification(notification_id),
 CONSTRAINT fk_email_outbox_user FOREIGN KEY(recipient_user_id) REFERENCES users(id),
 CONSTRAINT fk_email_outbox_notification FOREIGN KEY(notification_id) REFERENCES in_app_notifications(id),
 CONSTRAINT chk_email_outbox_path CHECK(target_path LIKE '/%' AND target_path NOT LIKE '//%'),
 INDEX idx_email_outbox_ready(status,available_at,created_at),
 INDEX idx_email_outbox_lease(status,locked_until)
) ENGINE=InnoDB;

DELIMITER $$
DROP TRIGGER IF EXISTS notification_email_outbox_insert$$
CREATE TRIGGER notification_email_outbox_insert AFTER INSERT ON in_app_notifications
FOR EACH ROW
BEGIN
 INSERT IGNORE INTO email_outbox(id,recipient_user_id,notification_id,dedupe_key,recipient_email,subject,body_text,target_path,source_type,source_id)
 SELECT UUID(),NEW.recipient_user_id,NEW.id,CONCAT('NOTIFICATION:',NEW.id),u.email,LEFT(CONCAT('Influence: ',NEW.title),180),NEW.body,NEW.target_path,'NOTIFICATION',NEW.entity_id
 FROM users u WHERE u.id=NEW.recipient_user_id AND u.status='ACTIVE';
END$$
DELIMITER ;
