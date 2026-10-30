DELIMITER $$
DROP PROCEDURE IF EXISTS sp_creator_asset_owner$$
CREATE PROCEDURE sp_creator_asset_owner(IN p_actor CHAR(36),OUT p_creator CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_guard INT; DECLARE v_user CHAR(36);
  SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
  SELECT id INTO v_user FROM users WHERE id=p_actor AND role_id=3 AND status='ACTIVE' FOR UPDATE;
  IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  SELECT id INTO p_creator FROM creators WHERE user_id=p_actor FOR UPDATE;
  IF p_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_NOT_FOUND'; END IF;
END$$
DROP PROCEDURE IF EXISTS sp_get_creator_assets$$
CREATE PROCEDURE sp_get_creator_assets(IN p_actor CHAR(36),IN p_creator CHAR(36),IN p_id CHAR(36),IN p_download BOOLEAN,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_creator CHAR(36); DECLARE v_admin BOOLEAN DEFAULT FALSE;
  IF p_creator IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=1 AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
    SET v_creator=p_creator; SET v_admin=TRUE;
  ELSE
    SELECT c.id INTO v_creator FROM creators c JOIN users u ON u.id=c.user_id WHERE u.id=p_actor AND u.role_id=3 AND u.status='ACTIVE';
    IF v_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM creators WHERE id=v_creator) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_NOT_FOUND'; END IF;
  IF p_download AND NOT EXISTS(SELECT 1 FROM creator_assets WHERE id=p_id AND creator_id=v_creator AND (NOT v_admin OR kind='VERIFICATION')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_NOT_FOUND'; END IF;
  SELECT id,kind,title,mime_type AS mimeType,byte_size AS byteSize,content_hash AS contentHash,width,height,page_count AS pageCount,
    revision,created_at AS createdAt,updated_at AS updatedAt,IF(p_download,file_content,NULL) AS fileContent
  FROM creator_assets WHERE creator_id=v_creator AND (p_id IS NULL OR id=p_id) AND (NOT v_admin OR kind='VERIFICATION') ORDER BY kind,created_at,id;
  SELECT verification_status AS verificationStatus FROM creators WHERE id=v_creator;
  IF p_download AND EXISTS(SELECT 1 FROM creator_assets WHERE id=p_id AND kind='VERIFICATION') THEN
    INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CREATOR_EVIDENCE_DOWNLOADED','creator_assets',p_id,p_request,JSON_OBJECT('adminReview',v_admin));
  END IF;
END$$
DROP PROCEDURE IF EXISTS sp_save_creator_asset$$
CREATE PROCEDURE sp_save_creator_asset(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_kind VARCHAR(20),IN p_title VARCHAR(120),IN p_content MEDIUMBLOB,IN p_mime VARCHAR(40),IN p_hash CHAR(64),IN p_width INT,IN p_height INT,IN p_pages INT,IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_creator CHAR(36); DECLARE v_revision INT; DECLARE v_kind VARCHAR(20); DECLARE v_limit INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_creator_asset_owner(p_actor,v_creator);
  IF p_revision IS NULL THEN
    IF p_kind NOT IN ('PHOTO','PORTFOLIO','VERIFICATION') OR p_kind IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_INVALID'; END IF;
    SET v_kind=p_kind; SET v_limit=CASE p_kind WHEN 'PHOTO' THEN 1 WHEN 'PORTFOLIO' THEN 10 ELSE 5 END;
    IF (SELECT COUNT(*) FROM creator_assets WHERE creator_id=v_creator AND kind=v_kind)>=v_limit THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_LIMIT'; END IF;
  ELSE
    SELECT revision,kind INTO v_revision,v_kind FROM creator_assets WHERE id=p_id AND creator_id=v_creator FOR UPDATE;
    IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_NOT_FOUND'; END IF;
    IF p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_CONFLICT'; END IF;
  END IF;
  IF p_title IS NULL OR CHAR_LENGTH(TRIM(p_title))<2 OR p_content IS NULL OR OCTET_LENGTH(p_content)=0 OR OCTET_LENGTH(p_content)>5242880 OR p_mime NOT IN ('image/webp','application/pdf') OR (v_kind='PHOTO' AND p_mime<>'image/webp') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_INVALID'; END IF;
  IF p_revision IS NULL THEN
    INSERT INTO creator_assets(id,creator_id,kind,title,file_content,mime_type,byte_size,content_hash,width,height,page_count) VALUES(p_id,v_creator,v_kind,p_title,p_content,p_mime,OCTET_LENGTH(p_content),p_hash,p_width,p_height,p_pages);
  ELSE
    UPDATE creator_assets SET title=p_title,file_content=p_content,mime_type=p_mime,byte_size=OCTET_LENGTH(p_content),content_hash=p_hash,width=p_width,height=p_height,page_count=p_pages,revision=revision+1 WHERE id=p_id AND creator_id=v_creator;
  END IF;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,IF(p_revision IS NULL,'CREATOR_ASSET_ADDED','CREATOR_ASSET_REPLACED'),'creator_assets',p_id,p_request,JSON_OBJECT('kind',v_kind,'revision',IFNULL(v_revision,0)+1,'byteSize',OCTET_LENGTH(p_content)));
  COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_delete_creator_asset$$
CREATE PROCEDURE sp_delete_creator_asset(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_creator CHAR(36); DECLARE v_revision INT; DECLARE v_kind VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_creator_asset_owner(p_actor,v_creator);
  SELECT revision,kind INTO v_revision,v_kind FROM creator_assets WHERE id=p_id AND creator_id=v_creator FOR UPDATE;
  IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_CONFLICT'; END IF;
  DELETE FROM creator_assets WHERE id=p_id AND creator_id=v_creator;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CREATOR_ASSET_REMOVED','creator_assets',p_id,p_request,JSON_OBJECT('kind',v_kind,'revision',v_revision));
  COMMIT;
END$$
DELIMITER ;
