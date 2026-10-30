DELIMITER $$
DROP PROCEDURE IF EXISTS sp_lock_campaign_draft$$
CREATE PROCEDURE sp_lock_campaign_draft(IN p_actor CHAR(36),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_guard INT; DECLARE v_brand CHAR(36); DECLARE v_status VARCHAR(32);
  SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
  CALL sp_brand_assert(p_actor,v_brand);
  SELECT status INTO v_status FROM campaigns WHERE id=p_campaign AND brand_id=v_brand FOR UPDATE;
  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND'; END IF;
  IF v_status<>'DRAFT' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_DRAFT'; END IF;
END$$
DROP PROCEDURE IF EXISTS sp_get_campaign_preparation$$
CREATE PROCEDURE sp_get_campaign_preparation(IN p_actor CHAR(36),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=2 AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_campaign AND b.user_id=p_actor) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND'; END IF;
  SELECT c.status,s.applications_open_at AS applicationsOpenAt,s.application_deadline AS applicationDeadline,s.start_at AS startAt,
    s.content_deadline AS contentDeadline,s.end_at AS endAt,COALESCE(s.revision,0) AS revision,s.updated_at AS updatedAt
  FROM campaigns c LEFT JOIN campaign_schedules s ON s.campaign_id=c.id WHERE c.id=p_campaign;
  SELECT id,kind,title,mime_type AS mimeType,content_hash AS contentHash,byte_size AS byteSize,width,height,page_count AS pageCount,revision,created_at AS createdAt,updated_at AS updatedAt FROM campaign_files WHERE campaign_id=p_campaign ORDER BY kind,created_at,id;
END$$
DROP PROCEDURE IF EXISTS sp_save_campaign_schedule$$
CREATE PROCEDURE sp_save_campaign_schedule(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_open DATETIME(3),IN p_apply DATETIME(3),IN p_start DATETIME(3),IN p_content DATETIME(3),IN p_end DATETIME(3),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_revision INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_lock_campaign_draft(p_actor,p_campaign);
  INSERT IGNORE INTO campaign_schedules(campaign_id) VALUES(p_campaign);
  SELECT revision INTO v_revision FROM campaign_schedules WHERE campaign_id=p_campaign FOR UPDATE;
  IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_SCHEDULE_CONFLICT'; END IF;
  IF NOT ((p_open IS NULL AND p_apply IS NULL AND p_start IS NULL AND p_content IS NULL AND p_end IS NULL) OR
    (p_open IS NOT NULL AND p_apply IS NOT NULL AND p_start IS NOT NULL AND p_content IS NOT NULL AND p_end IS NOT NULL AND p_open<p_apply AND p_apply<=p_start AND p_start<p_content AND p_content<=p_end)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_INVALID_SCHEDULE'; END IF;
  UPDATE campaign_schedules SET applications_open_at=p_open,application_deadline=p_apply,start_at=p_start,content_deadline=p_content,end_at=p_end,revision=revision+1 WHERE campaign_id=p_campaign;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CAMPAIGN_SCHEDULE_SAVED','campaigns',p_campaign,p_request,JSON_OBJECT('revision',v_revision+1,'hasSchedule',p_open IS NOT NULL));
  COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_get_campaign_file$$
CREATE PROCEDURE sp_get_campaign_file(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=2 AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN'; END IF;
  SELECT f.id,f.kind,f.mime_type AS mimeType,f.file_content AS fileContent FROM campaign_files f JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id WHERE f.id=p_id AND f.campaign_id=p_campaign AND b.user_id=p_actor;
END$$
DROP PROCEDURE IF EXISTS sp_save_campaign_file$$
CREATE PROCEDURE sp_save_campaign_file(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_id CHAR(36),IN p_kind VARCHAR(20),IN p_title VARCHAR(120),IN p_content MEDIUMBLOB,IN p_mime VARCHAR(40),IN p_hash CHAR(64),IN p_width INT,IN p_height INT,IN p_pages INT,IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_revision INT; DECLARE v_kind VARCHAR(20); DECLARE v_limit INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_lock_campaign_draft(p_actor,p_campaign);
  IF p_revision IS NULL THEN
    IF p_kind IS NULL OR p_kind NOT IN ('BRIEF','REFERENCE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_INVALID_FILE'; END IF;
    SET v_kind=p_kind;SET v_limit=IF(p_kind='BRIEF',1,5);
    IF (SELECT COUNT(*) FROM campaign_files WHERE campaign_id=p_campaign AND kind=v_kind)>=v_limit THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_FILE_LIMIT'; END IF;
  ELSE
    SELECT kind,revision INTO v_kind,v_revision FROM campaign_files WHERE id=p_id AND campaign_id=p_campaign FOR UPDATE;
    IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_FILE_NOT_FOUND'; END IF;
    IF p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_FILE_CONFLICT'; END IF;
  END IF;
  IF p_title IS NULL OR CHAR_LENGTH(TRIM(p_title))<2 OR p_content IS NULL OR OCTET_LENGTH(p_content)=0 OR OCTET_LENGTH(p_content)>5242880 OR p_mime IS NULL OR p_mime NOT IN ('image/webp','application/pdf') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_INVALID_FILE'; END IF;
  IF p_revision IS NULL THEN
    INSERT INTO campaign_files(id,campaign_id,kind,title,file_content,mime_type,content_hash,byte_size,width,height,page_count) VALUES(p_id,p_campaign,v_kind,p_title,p_content,p_mime,p_hash,OCTET_LENGTH(p_content),p_width,p_height,p_pages);
  ELSE UPDATE campaign_files SET title=p_title,file_content=p_content,mime_type=p_mime,content_hash=p_hash,byte_size=OCTET_LENGTH(p_content),width=p_width,height=p_height,page_count=p_pages,revision=revision+1 WHERE id=p_id AND campaign_id=p_campaign; END IF;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,IF(p_revision IS NULL,'CAMPAIGN_FILE_ADDED','CAMPAIGN_FILE_REPLACED'),'campaign_files',p_id,p_request,JSON_OBJECT('kind',v_kind,'revision',IFNULL(v_revision,0)+1,'byteSize',OCTET_LENGTH(p_content)));
  COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_delete_campaign_file$$
CREATE PROCEDURE sp_delete_campaign_file(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_id CHAR(36),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_revision INT; DECLARE v_kind VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_lock_campaign_draft(p_actor,p_campaign);
  SELECT revision,kind INTO v_revision,v_kind FROM campaign_files WHERE id=p_id AND campaign_id=p_campaign FOR UPDATE;
  IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_FILE_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_FILE_CONFLICT'; END IF;
  DELETE FROM campaign_files WHERE id=p_id AND campaign_id=p_campaign;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CAMPAIGN_FILE_REMOVED','campaign_files',p_id,p_request,JSON_OBJECT('kind',v_kind,'revision',v_revision));
  COMMIT;
END$$
DELIMITER ;
