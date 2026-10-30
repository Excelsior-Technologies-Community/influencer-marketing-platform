CREATE TABLE IF NOT EXISTS campaign_messages (
 id CHAR(36) PRIMARY KEY,
 campaign_id CHAR(36) NOT NULL,
 application_id CHAR(36) NOT NULL,
 sender_user_id CHAR(36) NOT NULL,
 body_text VARCHAR(4000) NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_campaign_message_application FOREIGN KEY(application_id) REFERENCES campaign_applications(id),
 CONSTRAINT fk_campaign_message_sender FOREIGN KEY(sender_user_id) REFERENCES users(id),
 INDEX idx_campaign_message_thread(application_id,created_at,id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_message_reads (
 message_id CHAR(36) NOT NULL,
 reader_user_id CHAR(36) NOT NULL,
 read_at TIMESTAMP(6) NULL,
 PRIMARY KEY(message_id,reader_user_id),
 CONSTRAINT fk_campaign_message_read_message FOREIGN KEY(message_id) REFERENCES campaign_messages(id),
 CONSTRAINT fk_campaign_message_read_user FOREIGN KEY(reader_user_id) REFERENCES users(id),
 INDEX idx_campaign_message_unread(reader_user_id,read_at,message_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campaign_message_attachments (
 id CHAR(36) PRIMARY KEY,
 message_id CHAR(36) NOT NULL UNIQUE,
 title VARCHAR(120) NOT NULL,
 mime_type VARCHAR(32) NOT NULL,
 byte_size INT UNSIGNED NOT NULL,
 sha256 CHAR(64) NOT NULL,
 file_content LONGBLOB NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_campaign_message_attachment_message FOREIGN KEY(message_id) REFERENCES campaign_messages(id),
 CONSTRAINT chk_campaign_message_attachment_type CHECK(mime_type IN ('application/pdf','image/webp')),
 CONSTRAINT chk_campaign_message_attachment_size CHECK(byte_size BETWEEN 1 AND 5242880),
 CONSTRAINT chk_campaign_message_attachment_hash CHECK(sha256 REGEXP '^[0-9a-f]{64}$'),
 INDEX idx_campaign_message_attachment_message(message_id)
) ENGINE=InnoDB;

DELIMITER $$
DROP TRIGGER IF EXISTS campaign_messages_no_update$$
CREATE TRIGGER campaign_messages_no_update BEFORE UPDATE ON campaign_messages
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_IMMUTABLE';
END$$
DROP TRIGGER IF EXISTS campaign_messages_no_delete$$
CREATE TRIGGER campaign_messages_no_delete BEFORE DELETE ON campaign_messages
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_IMMUTABLE';
END$$
DROP TRIGGER IF EXISTS campaign_message_attachments_no_update$$
CREATE TRIGGER campaign_message_attachments_no_update BEFORE UPDATE ON campaign_message_attachments
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_ATTACHMENT_IMMUTABLE';
END$$
DROP TRIGGER IF EXISTS campaign_message_attachments_no_delete$$
CREATE TRIGGER campaign_message_attachments_no_delete BEFORE DELETE ON campaign_message_attachments
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_ATTACHMENT_IMMUTABLE';
END$$
DROP TRIGGER IF EXISTS campaign_message_reads_one_way$$
CREATE TRIGGER campaign_message_reads_one_way BEFORE UPDATE ON campaign_message_reads
FOR EACH ROW
BEGIN
 IF OLD.message_id<>NEW.message_id OR OLD.reader_user_id<>NEW.reader_user_id OR OLD.read_at IS NOT NULL OR NEW.read_at IS NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_READ_IMMUTABLE';
 END IF;
END$$
DELIMITER ;
