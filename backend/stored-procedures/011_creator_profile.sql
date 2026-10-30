DELIMITER $$
DROP PROCEDURE IF EXISTS sp_get_creator$$
CREATE PROCEDURE sp_get_creator(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  SELECT c.id,c.user_id AS userId,u.name,u.email,u.status,c.bio,c.location,c.verification_status AS verificationStatus,
    p.details,COALESCE(p.revision,0) AS revision,c.created_at AS createdAt,c.updated_at AS updatedAt
  FROM creators c JOIN users u ON u.id=c.user_id LEFT JOIN creator_profiles p ON p.creator_id=c.id
  WHERE c.user_id=p_actor AND u.role_id=3 AND u.status='ACTIVE';
  SELECT cat.id,cat.name,cat.parent_id AS parentId,parent.name AS parentName,
    (cat.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) AS isAvailable
  FROM creator_categories cc JOIN creators c ON c.id=cc.creator_id JOIN users u ON u.id=c.user_id
    JOIN categories cat ON cat.id=cc.category_id LEFT JOIN categories parent ON parent.id=cat.parent_id
  WHERE c.user_id=p_actor AND u.role_id=3 AND u.status='ACTIVE' ORDER BY cat.name,cat.id;
END$$
DROP PROCEDURE IF EXISTS sp_update_creator$$
CREATE PROCEDURE sp_update_creator(IN p_actor CHAR(36),IN p_bio TEXT,IN p_location VARCHAR(160),IN p_details JSON,IN p_categories JSON,IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_guard TINYINT;
  DECLARE v_user CHAR(36);
  DECLARE v_creator CHAR(36);
  DECLARE v_revision INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
  SELECT id INTO v_user FROM users WHERE id=p_actor AND role_id=3 AND status='ACTIVE' FOR UPDATE;
  IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  SELECT id INTO v_creator FROM creators WHERE user_id=p_actor FOR UPDATE;
  IF v_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_NOT_FOUND'; END IF;
  IF p_details IS NULL OR JSON_TYPE(p_details)<>'OBJECT' OR p_categories IS NULL OR JSON_TYPE(p_categories)<>'ARRAY' OR JSON_LENGTH(p_categories)>10 OR CHAR_LENGTH(COALESCE(p_bio,''))>3000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_INVALID_PROFILE'; END IF;
  INSERT IGNORE INTO creator_profiles(creator_id,details) VALUES(v_creator,JSON_OBJECT());
  SELECT revision INTO v_revision FROM creator_profiles WHERE creator_id=v_creator FOR UPDATE;
  IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_PROFILE_CONFLICT'; END IF;
  IF EXISTS(
    SELECT 1 FROM JSON_TABLE(p_categories,'$[*]' COLUMNS(category_id INT PATH '$')) requested
    LEFT JOIN categories cat ON cat.id=requested.category_id LEFT JOIN categories parent ON parent.id=cat.parent_id
    LEFT JOIN creator_categories existing ON existing.creator_id=v_creator AND existing.category_id=requested.category_id
    WHERE cat.id IS NULL OR ((cat.is_active=FALSE OR (parent.id IS NOT NULL AND parent.is_active=FALSE)) AND existing.category_id IS NULL)
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_INVALID_CATEGORY'; END IF;
  UPDATE creators SET bio=p_bio,location=p_location,updated_at=UTC_TIMESTAMP(6) WHERE id=v_creator;
  UPDATE creator_profiles SET details=p_details,revision=revision+1 WHERE creator_id=v_creator;
  DELETE FROM creator_categories WHERE creator_id=v_creator AND category_id NOT IN (SELECT category_id FROM JSON_TABLE(p_categories,'$[*]' COLUMNS(category_id INT PATH '$')) requested);
  INSERT IGNORE INTO creator_categories(creator_id,category_id) SELECT v_creator,category_id FROM JSON_TABLE(p_categories,'$[*]' COLUMNS(category_id INT PATH '$')) requested;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CREATOR_PROFILE_UPDATED','creators',v_creator,p_request,JSON_OBJECT('previousRevision',v_revision,'revision',v_revision+1,'categoryCount',JSON_LENGTH(p_categories),'languageCount',JSON_LENGTH(JSON_EXTRACT(p_details,'$.languages')),'skillCount',JSON_LENGTH(JSON_EXTRACT(p_details,'$.skills'))));
  COMMIT;
  CALL sp_get_creator(p_actor);
END$$
DROP PROCEDURE IF EXISTS sp_get_creator_profile_categories$$
CREATE PROCEDURE sp_get_creator_profile_categories(IN p_actor CHAR(36),IN p_search VARCHAR(300),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  SELECT cat.id,cat.name,cat.parent_id AS parentId,parent.name AS parentName,
    (cat.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) AS isAvailable,(cc.creator_id IS NOT NULL) AS isSelected
  FROM categories cat LEFT JOIN categories parent ON parent.id=cat.parent_id
    LEFT JOIN creators c ON c.user_id=p_actor LEFT JOIN creator_categories cc ON cc.creator_id=c.id AND cc.category_id=cat.id
  WHERE ((cat.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) OR cc.creator_id IS NOT NULL)
    AND (p_search='' OR cat.name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR parent.name LIKE CONCAT('%',p_search,'%') ESCAPE '=')
  ORDER BY cat.name,cat.id LIMIT p_limit OFFSET p_offset;
  SELECT COUNT(*) AS total FROM categories cat LEFT JOIN categories parent ON parent.id=cat.parent_id
    LEFT JOIN creators c ON c.user_id=p_actor LEFT JOIN creator_categories cc ON cc.creator_id=c.id AND cc.category_id=cat.id
  WHERE ((cat.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) OR cc.creator_id IS NOT NULL)
    AND (p_search='' OR cat.name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR parent.name LIKE CONCAT('%',p_search,'%') ESCAPE '=');
END$$
DELIMITER ;
