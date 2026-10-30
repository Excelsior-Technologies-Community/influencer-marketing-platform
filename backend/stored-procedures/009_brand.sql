DELIMITER $$
DROP PROCEDURE IF EXISTS sp_brand_assert$$
CREATE PROCEDURE sp_brand_assert(IN p_actor CHAR(36),OUT p_brand CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_user CHAR(36);
  SELECT id INTO v_user FROM users WHERE id=p_actor AND role_id=2 AND status='ACTIVE' FOR UPDATE;
  IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN'; END IF;
  SELECT id INTO p_brand FROM brands WHERE user_id=p_actor FOR UPDATE;
  IF p_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_NOT_FOUND'; END IF;
END$$
DROP PROCEDURE IF EXISTS sp_get_brand$$
CREATE PROCEDURE sp_get_brand(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  SELECT b.id,b.user_id AS userId,u.name AS accountName,u.email AS accountEmail,u.status,
    b.company_name AS companyName,b.website,b.industry,b.description,
    p.details,COALESCE(p.revision,0) AS revision,b.created_at AS createdAt,b.updated_at AS updatedAt,
    l.mime_type AS logoMime,l.content_hash AS logoHash,l.byte_size AS logoSize,l.width AS logoWidth,l.height AS logoHeight,l.updated_at AS logoUpdatedAt,COALESCE(p.logo_revision,0) AS logoRevision
  FROM brands b JOIN users u ON u.id=b.user_id
    LEFT JOIN brand_profiles p ON p.brand_id=b.id LEFT JOIN brand_logos l ON l.brand_id=b.id
  WHERE b.user_id=p_actor AND u.role_id=2 AND u.status='ACTIVE';
END$$
DROP PROCEDURE IF EXISTS sp_update_brand$$
CREATE PROCEDURE sp_update_brand(IN p_actor CHAR(36),IN p_company VARCHAR(160),IN p_website VARCHAR(2048),IN p_industry VARCHAR(120),IN p_description TEXT,IN p_details JSON,IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_brand CHAR(36);
  DECLARE v_revision INT;
  DECLARE v_old JSON;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_brand_assert(p_actor,v_brand);
  IF p_company IS NULL OR CHAR_LENGTH(TRIM(p_company))<2 OR p_details IS NULL OR JSON_TYPE(p_details)<>'OBJECT' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_INVALID_PROFILE'; END IF;
  INSERT IGNORE INTO brand_profiles(brand_id,details) VALUES(v_brand,JSON_OBJECT());
  SELECT revision INTO v_revision FROM brand_profiles WHERE brand_id=v_brand FOR UPDATE;
  IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_PROFILE_CONFLICT'; END IF;
  SELECT JSON_OBJECT('companyName',company_name,'website',website,'industry',industry,'description',description) INTO v_old FROM brands WHERE id=v_brand;
  UPDATE brands SET company_name=p_company,website=p_website,industry=p_industry,description=p_description WHERE id=v_brand;
  UPDATE brand_profiles SET details=p_details,revision=revision+1 WHERE brand_id=v_brand;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'BRAND_PROFILE_UPDATED','brands',v_brand,p_request,JSON_OBJECT('previousRevision',v_revision,'revision',v_revision+1,'before',v_old,'after',JSON_OBJECT('companyName',p_company,'website',p_website,'industry',p_industry,'description',p_description)));
  COMMIT;
  CALL sp_get_brand(p_actor);
END$$
DROP PROCEDURE IF EXISTS sp_save_brand_logo$$
CREATE PROCEDURE sp_save_brand_logo(IN p_actor CHAR(36),IN p_image MEDIUMBLOB,IN p_hash CHAR(64),IN p_width INT,IN p_height INT,IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_brand CHAR(36);
  DECLARE v_revision INT DEFAULT 0;
  DECLARE v_oldhash CHAR(64);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_brand_assert(p_actor,v_brand);
  INSERT IGNORE INTO brand_profiles(brand_id,details) VALUES(v_brand,JSON_OBJECT());
  SELECT logo_revision INTO v_revision FROM brand_profiles WHERE brand_id=v_brand FOR UPDATE;
  SELECT content_hash INTO v_oldhash FROM brand_logos WHERE brand_id=v_brand FOR UPDATE;
  IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_LOGO_CONFLICT'; END IF;
  IF p_image IS NULL OR OCTET_LENGTH(p_image)>2097152 OR p_width<1 OR p_width>512 OR p_height<1 OR p_height>512 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_INVALID_LOGO'; END IF;
  INSERT INTO brand_logos(brand_id,image,mime_type,content_hash,byte_size,width,height,revision) VALUES(v_brand,p_image,'image/webp',p_hash,OCTET_LENGTH(p_image),p_width,p_height,v_revision+1)
    ON DUPLICATE KEY UPDATE image=p_image,mime_type='image/webp',content_hash=p_hash,byte_size=OCTET_LENGTH(p_image),width=p_width,height=p_height,revision=v_revision+1;
  UPDATE brand_profiles SET logo_revision=v_revision+1 WHERE brand_id=v_brand;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'BRAND_LOGO_UPDATED','brands',v_brand,p_request,JSON_OBJECT('previousHash',v_oldhash,'hash',p_hash,'revision',v_revision+1,'bytes',OCTET_LENGTH(p_image)));
  COMMIT;
  CALL sp_get_brand(p_actor);
END$$
DROP PROCEDURE IF EXISTS sp_get_brand_logo$$
CREATE PROCEDURE sp_get_brand_logo(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  SELECT l.image,l.mime_type AS mimeType,l.content_hash AS contentHash FROM brand_logos l JOIN brands b ON b.id=l.brand_id JOIN users u ON u.id=b.user_id
  WHERE b.user_id=p_actor AND u.role_id=2 AND u.status='ACTIVE';
END$$
DROP PROCEDURE IF EXISTS sp_delete_brand_logo$$
CREATE PROCEDURE sp_delete_brand_logo(IN p_actor CHAR(36),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_brand CHAR(36);
  DECLARE v_revision INT DEFAULT 0;
  DECLARE v_hash CHAR(64);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_brand_assert(p_actor,v_brand);
  INSERT IGNORE INTO brand_profiles(brand_id,details) VALUES(v_brand,JSON_OBJECT());
  SELECT logo_revision INTO v_revision FROM brand_profiles WHERE brand_id=v_brand FOR UPDATE;
  SELECT content_hash INTO v_hash FROM brand_logos WHERE brand_id=v_brand FOR UPDATE;
  IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_LOGO_CONFLICT'; END IF;
  IF v_hash IS NOT NULL THEN
    DELETE FROM brand_logos WHERE brand_id=v_brand;
    UPDATE brand_profiles SET logo_revision=v_revision+1 WHERE brand_id=v_brand;
    INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'BRAND_LOGO_REMOVED','brands',v_brand,p_request,JSON_OBJECT('previousHash',v_hash,'revision',v_revision));
  END IF;
  COMMIT;
  CALL sp_get_brand(p_actor);
END$$
DELIMITER ;
