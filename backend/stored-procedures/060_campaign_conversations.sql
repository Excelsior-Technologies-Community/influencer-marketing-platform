DELIMITER $$
DROP PROCEDURE IF EXISTS sp_campaign_conversation_assert$$
CREATE PROCEDURE sp_campaign_conversation_assert(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36),IN p_application CHAR(36),OUT p_other_user CHAR(36))
SQL SECURITY INVOKER
BEGIN
 SET p_other_user=NULL;
 IF p_role NOT IN ('BRAND_ADMIN','CREATOR') OR NOT EXISTS(
  SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id
  WHERE u.id=p_actor AND u.status='ACTIVE' AND r.code=p_role
 ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_FORBIDDEN';END IF;
 IF p_role='BRAND_ADMIN' THEN
  SELECT cr.user_id INTO p_other_user
  FROM campaigns c JOIN brands b ON b.id=c.brand_id
  JOIN campaign_applications a ON a.id=p_application AND a.campaign_id=c.id AND a.status='APPROVED'
  JOIN campaign_creator_allocations x ON x.application_id=a.id AND x.campaign_id=c.id
  JOIN creators cr ON cr.id=x.creator_id
  WHERE c.id=p_campaign AND b.user_id=p_actor LIMIT 1;
 ELSE
  SELECT b.user_id INTO p_other_user
  FROM campaigns c JOIN brands b ON b.id=c.brand_id
  JOIN campaign_applications a ON a.id=p_application AND a.campaign_id=c.id AND a.status='APPROVED'
  JOIN campaign_creator_allocations x ON x.application_id=a.id AND x.campaign_id=c.id
  JOIN creators cr ON cr.id=x.creator_id
  WHERE c.id=p_campaign AND cr.user_id=p_actor LIMIT 1;
 END IF;
 IF p_other_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_NOT_FOUND';END IF;
END$$

DROP PROCEDURE IF EXISTS sp_campaign_conversations_read$$
CREATE PROCEDURE sp_campaign_conversations_read(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
  IF p_role NOT IN ('BRAND_ADMIN','CREATOR') OR NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=p_actor AND u.status='ACTIVE' AND r.code=p_role) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_FORBIDDEN';
  END IF;
  IF p_role='BRAND_ADMIN' THEN
   IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_campaign AND b.user_id=p_actor) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
  ELSEIF NOT EXISTS(SELECT 1 FROM campaign_applications a JOIN campaign_creator_allocations x ON x.application_id=a.id AND x.campaign_id=a.campaign_id JOIN creators cr ON cr.id=x.creator_id WHERE a.campaign_id=p_campaign AND a.status='APPROVED' AND cr.user_id=p_actor) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';
  END IF;
  SELECT c.id,c.title,c.status FROM campaigns c WHERE c.id=p_campaign;
  IF p_role='BRAND_ADMIN' THEN
   SELECT a.id AS applicationId,u.id AS participantUserId,u.name AS participantName,'CREATOR' AS participantRole,
    latest.id AS lastMessageId,latest.body_text AS lastMessage,latest.created_at AS lastMessageAt,latest.sender_user_id AS lastSenderUserId,
    latest_file.title AS lastAttachmentTitle,
    (SELECT COUNT(*) FROM campaign_message_reads mr JOIN campaign_messages mm ON mm.id=mr.message_id WHERE mm.application_id=a.id AND mr.reader_user_id=p_actor AND mr.read_at IS NULL) AS unreadCount
   FROM campaigns c JOIN campaign_applications a ON a.campaign_id=c.id AND a.status='APPROVED'
   JOIN campaign_creator_allocations x ON x.application_id=a.id AND x.campaign_id=c.id
   JOIN creators cr ON cr.id=x.creator_id JOIN users u ON u.id=cr.user_id
   LEFT JOIN campaign_messages latest ON latest.id=(SELECT m.id FROM campaign_messages m WHERE m.application_id=a.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1)
   LEFT JOIN campaign_message_attachments latest_file ON latest_file.message_id=latest.id
   WHERE c.id=p_campaign AND c.brand_id=(SELECT id FROM brands WHERE user_id=p_actor)
   ORDER BY COALESCE(latest.created_at,a.updated_at) DESC,a.id;
  ELSE
   SELECT a.id AS applicationId,b.user_id AS participantUserId,b.company_name AS participantName,'BRAND_ADMIN' AS participantRole,
    latest.id AS lastMessageId,latest.body_text AS lastMessage,latest.created_at AS lastMessageAt,latest.sender_user_id AS lastSenderUserId,
    latest_file.title AS lastAttachmentTitle,
    (SELECT COUNT(*) FROM campaign_message_reads mr JOIN campaign_messages mm ON mm.id=mr.message_id WHERE mm.application_id=a.id AND mr.reader_user_id=p_actor AND mr.read_at IS NULL) AS unreadCount
   FROM campaign_applications a JOIN campaign_creator_allocations x ON x.application_id=a.id AND x.campaign_id=a.campaign_id
   JOIN creators cr ON cr.id=x.creator_id JOIN campaigns c ON c.id=a.campaign_id
   JOIN brands b ON b.id=c.brand_id
   LEFT JOIN campaign_messages latest ON latest.id=(SELECT m.id FROM campaign_messages m WHERE m.application_id=a.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1)
   LEFT JOIN campaign_message_attachments latest_file ON latest_file.message_id=latest.id
   WHERE a.campaign_id=p_campaign AND a.status='APPROVED' AND cr.user_id=p_actor
   ORDER BY COALESCE(latest.created_at,a.updated_at) DESC,a.id;
  END IF;
  COMMIT;
 END;
END$$

DROP PROCEDURE IF EXISTS sp_campaign_conversation_messages$$
CREATE PROCEDURE sp_campaign_conversation_messages(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36),IN p_application CHAR(36),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_other CHAR(36);
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
  CALL sp_campaign_conversation_assert(p_actor,p_role,p_campaign,p_application,v_other);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset<0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_INVALID';END IF;
  SELECT c.id AS campaignId,c.title,c.status,a.id AS applicationId,v_other AS participantUserId,
   COALESCE(b.company_name,other_user.name) AS participantName
  FROM campaigns c JOIN campaign_applications a ON a.id=p_application AND a.campaign_id=c.id
  JOIN users other_user ON other_user.id=v_other LEFT JOIN brands b ON b.user_id=other_user.id
  WHERE c.id=p_campaign;
  SELECT page.id,page.sender_user_id AS senderUserId,u.name AS senderName,page.body_text AS body,page.created_at AS createdAt,
   attachment.id AS attachmentId,attachment.title AS attachmentTitle,attachment.mime_type AS attachmentMimeType,attachment.byte_size AS attachmentByteSize,
   receipt.read_at AS readAt,(receipt.read_at IS NOT NULL) AS isRead
  FROM (SELECT m.id,m.sender_user_id,m.body_text,m.created_at FROM campaign_messages m WHERE m.campaign_id=p_campaign AND m.application_id=p_application ORDER BY m.created_at DESC,m.id DESC LIMIT p_limit OFFSET p_offset) page
  JOIN users u ON u.id=page.sender_user_id
  LEFT JOIN campaign_message_attachments attachment ON attachment.message_id=page.id
  LEFT JOIN campaign_message_reads receipt ON receipt.message_id=page.id AND receipt.reader_user_id=v_other
  ORDER BY page.created_at,page.id;
  SELECT COUNT(*) AS total FROM campaign_messages WHERE campaign_id=p_campaign AND application_id=p_application;
  COMMIT;
 END;
END$$

DROP PROCEDURE IF EXISTS sp_campaign_conversation_send$$
CREATE PROCEDURE sp_campaign_conversation_send(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36),IN p_application CHAR(36),IN p_message CHAR(36),IN p_body VARCHAR(4000),IN p_attachment CHAR(36),IN p_title VARCHAR(120),IN p_file LONGBLOB,IN p_mime VARCHAR(32),IN p_hash CHAR(64),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard TINYINT UNSIGNED;DECLARE v_other CHAR(36);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_campaign_conversation_assert(p_actor,p_role,p_campaign,p_application,v_other);
 IF p_body IS NOT NULL AND CHAR_LENGTH(p_body)>4000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_INVALID';END IF;
 IF (p_body IS NULL OR CHAR_LENGTH(TRIM(p_body))=0) AND p_file IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_INVALID';END IF;
 IF p_file IS NULL AND (p_attachment IS NOT NULL OR p_title IS NOT NULL OR p_mime IS NOT NULL OR p_hash IS NOT NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_ATTACHMENT_INVALID';END IF;
 IF p_file IS NOT NULL AND (p_attachment IS NULL OR p_title IS NULL OR CHAR_LENGTH(TRIM(p_title))<2 OR CHAR_LENGTH(p_title)>120 OR p_mime NOT IN ('application/pdf','image/webp') OR OCTET_LENGTH(p_file)>5242880 OR OCTET_LENGTH(p_file)<1 OR p_hash NOT REGEXP '^[0-9a-f]{64}$') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_ATTACHMENT_INVALID';
 END IF;
 INSERT INTO campaign_messages(id,campaign_id,application_id,sender_user_id,body_text)
 VALUES(p_message,p_campaign,p_application,p_actor,NULLIF(TRIM(p_body),''));
 INSERT INTO campaign_message_reads(message_id,reader_user_id,read_at) VALUES(p_message,v_other,NULL);
 IF p_file IS NOT NULL THEN
  INSERT INTO campaign_message_attachments(id,message_id,title,mime_type,byte_size,sha256,file_content)
  VALUES(p_attachment,p_message,TRIM(p_title),p_mime,OCTET_LENGTH(p_file),p_hash,p_file);
 END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata)
 VALUES(p_actor,'CAMPAIGN_MESSAGE_SENT','campaign_messages',p_message,p_request,JSON_OBJECT('campaignId',p_campaign,'applicationId',p_application,'hasAttachment',p_file IS NOT NULL));
 COMMIT;
 SELECT id,campaign_id AS campaignId,application_id AS applicationId,sender_user_id AS senderUserId,body_text AS body,created_at AS createdAt FROM campaign_messages WHERE id=p_message;
END$$

DROP PROCEDURE IF EXISTS sp_campaign_conversation_mark_read$$
CREATE PROCEDURE sp_campaign_conversation_mark_read(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36),IN p_application CHAR(36),IN p_message_ids JSON)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_other CHAR(36);DECLARE v_updated INT DEFAULT 0;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 CALL sp_campaign_conversation_assert(p_actor,p_role,p_campaign,p_application,v_other);
 IF p_message_ids IS NULL OR JSON_TYPE(p_message_ids)<>'ARRAY' OR JSON_LENGTH(p_message_ids)>50 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_MESSAGE_READ_INVALID';END IF;
 UPDATE campaign_message_reads receipt
 JOIN campaign_messages message ON message.id=receipt.message_id
 JOIN JSON_TABLE(p_message_ids,'$[*]' COLUMNS(message_id CHAR(36) PATH '$')) requested ON requested.message_id=message.id
 SET receipt.read_at=UTC_TIMESTAMP(6)
 WHERE message.campaign_id=p_campaign AND message.application_id=p_application AND message.sender_user_id=v_other AND receipt.reader_user_id=p_actor AND receipt.read_at IS NULL;
 SET v_updated=ROW_COUNT();
 COMMIT;
 SELECT v_updated AS updatedCount;
END$$

DROP PROCEDURE IF EXISTS sp_campaign_message_attachment_file$$
CREATE PROCEDURE sp_campaign_message_attachment_file(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36),IN p_application CHAR(36),IN p_message CHAR(36),IN p_attachment CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_other CHAR(36);DECLARE v_guard TINYINT UNSIGNED;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_campaign_conversation_assert(p_actor,p_role,p_campaign,p_application,v_other);
 IF NOT EXISTS(SELECT 1 FROM campaign_message_attachments a JOIN campaign_messages m ON m.id=a.message_id WHERE a.id=p_attachment AND m.id=p_message AND m.campaign_id=p_campaign AND m.application_id=p_application) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_ATTACHMENT_NOT_FOUND';
 END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata)
 VALUES(p_actor,'CAMPAIGN_MESSAGE_ATTACHMENT_READ','campaign_message_attachments',p_attachment,p_request,JSON_OBJECT('campaignId',p_campaign,'applicationId',p_application,'messageId',p_message));
 SELECT id,title,mime_type AS mimeType,file_content AS fileContent,byte_size AS byteSize FROM campaign_message_attachments WHERE id=p_attachment;
 COMMIT;
END$$
DELIMITER ;
