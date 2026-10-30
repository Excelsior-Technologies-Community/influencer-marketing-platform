DELIMITER $$
DROP PROCEDURE IF EXISTS sp_admin_assert$$
CREATE PROCEDURE sp_admin_assert(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_role TINYINT;
  DECLARE v_actor CHAR(36);
  SELECT id INTO v_role FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
  SELECT id INTO v_actor FROM users WHERE id=p_actor AND role_id=v_role AND status='ACTIVE';
  IF v_actor IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_FORBIDDEN'; END IF;
END$$
DROP PROCEDURE IF EXISTS sp_admin_dashboard$$
CREATE PROCEDURE sp_admin_dashboard()
SQL SECURITY INVOKER
BEGIN
  SELECT (SELECT COUNT(*) FROM brands) AS totalBrands,
    (SELECT COUNT(*) FROM creators) AS totalCreators,
    (SELECT COUNT(*) FROM users WHERE role_id IN (2,3) AND status='ACTIVE') AS activeAccounts,
    (SELECT COUNT(*) FROM users WHERE role_id IN (2,3) AND status='SUSPENDED') AS suspendedAccounts,
    (SELECT COUNT(*) FROM creators WHERE verification_status IN ('PENDING','UNDER_REVIEW')) AS pendingVerification,
    (SELECT COUNT(*) FROM creators WHERE verification_status='VERIFIED') AS verifiedCreators,
    (SELECT COUNT(*) FROM categories WHERE is_active=TRUE) AS activeCategories,
    (SELECT COUNT(*) FROM platforms WHERE is_active=TRUE) AS activePlatforms,
    (SELECT COUNT(*) FROM content_types WHERE is_active=TRUE) AS activeContentTypes;
END$$
DROP PROCEDURE IF EXISTS sp_admin_registration_trend$$
CREATE PROCEDURE sp_admin_registration_trend()
SQL SECURITY INVOKER
BEGIN
  WITH RECURSIVE months AS (
    SELECT DATE_SUB(CAST(DATE_FORMAT(UTC_DATE(),'%Y-%m-01') AS DATE),INTERVAL 5 MONTH) AS month
    UNION ALL SELECT DATE_ADD(month,INTERVAL 1 MONTH) FROM months WHERE month<CAST(DATE_FORMAT(UTC_DATE(),'%Y-%m-01') AS DATE)
  )
  SELECT DATE_FORMAT(m.month,'%Y-%m') AS month,
    SUM(CASE WHEN u.role_id=2 THEN 1 ELSE 0 END) AS brands,
    SUM(CASE WHEN u.role_id=3 THEN 1 ELSE 0 END) AS creators
  FROM months m LEFT JOIN users u ON u.created_at>=m.month AND u.created_at<DATE_ADD(m.month,INTERVAL 1 MONTH) AND u.role_id IN (2,3)
  GROUP BY m.month ORDER BY m.month;
END$$
DROP PROCEDURE IF EXISTS sp_admin_list_brands$$
CREATE PROCEDURE sp_admin_list_brands(IN p_search VARCHAR(300),IN p_status VARCHAR(16),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  SELECT b.id,u.id AS userId,u.name,u.email,u.phone,u.status,u.created_at AS createdAt,b.company_name AS companyName,b.website,b.industry,b.description
  FROM brands b JOIN users u ON u.id=b.user_id
  WHERE (p_status IS NULL OR u.status=p_status) AND (p_search='' OR u.name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR u.email LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR b.company_name LIKE CONCAT('%',p_search,'%') ESCAPE '=')
  ORDER BY u.created_at DESC,u.id LIMIT p_limit OFFSET p_offset;
  SELECT COUNT(*) AS total FROM brands b JOIN users u ON u.id=b.user_id
  WHERE (p_status IS NULL OR u.status=p_status) AND (p_search='' OR u.name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR u.email LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR b.company_name LIKE CONCAT('%',p_search,'%') ESCAPE '=');
END$$
DROP PROCEDURE IF EXISTS sp_admin_list_creators$$
CREATE PROCEDURE sp_admin_list_creators(IN p_search VARCHAR(300),IN p_status VARCHAR(16),IN p_verification VARCHAR(16),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  SELECT c.id,u.id AS userId,u.name,u.email,u.phone,u.status,u.created_at AS createdAt,c.bio,c.location,c.verification_status AS verificationStatus
  FROM creators c JOIN users u ON u.id=c.user_id
  WHERE (p_status IS NULL OR u.status=p_status) AND (p_verification IS NULL OR c.verification_status=p_verification) AND (p_search='' OR u.name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR u.email LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR COALESCE(c.location,'') LIKE CONCAT('%',p_search,'%') ESCAPE '=')
  ORDER BY u.created_at DESC,u.id LIMIT p_limit OFFSET p_offset;
  SELECT COUNT(*) AS total FROM creators c JOIN users u ON u.id=c.user_id
  WHERE (p_status IS NULL OR u.status=p_status) AND (p_verification IS NULL OR c.verification_status=p_verification) AND (p_search='' OR u.name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR u.email LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR COALESCE(c.location,'') LIKE CONCAT('%',p_search,'%') ESCAPE '=');
END$$
DROP PROCEDURE IF EXISTS sp_admin_get_account$$
CREATE PROCEDURE sp_admin_get_account(IN p_kind VARCHAR(16),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
  IF p_kind='brands' THEN
    SELECT b.id,u.id AS userId,u.name,u.email,u.phone,u.status,u.created_at AS createdAt,u.updated_at AS updatedAt,b.company_name AS companyName,b.website,b.industry,b.description FROM brands b JOIN users u ON u.id=b.user_id WHERE b.id=p_id;
  ELSEIF p_kind='creators' THEN
    SELECT c.id,u.id AS userId,u.name,u.email,u.phone,u.status,u.created_at AS createdAt,u.updated_at AS updatedAt,c.bio,c.location,c.verification_status AS verificationStatus FROM creators c JOIN users u ON u.id=c.user_id WHERE c.id=p_id;
  ELSE SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_KIND'; END IF;
END$$
DROP PROCEDURE IF EXISTS sp_admin_change_status$$
CREATE PROCEDURE sp_admin_change_status(IN p_actor CHAR(36),IN p_kind VARCHAR(16),IN p_id CHAR(36),IN p_status VARCHAR(16),IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_user CHAR(36);
  DECLARE v_old VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_admin_assert(p_actor);
  IF p_kind='brands' THEN SELECT user_id INTO v_user FROM brands WHERE id=p_id;
  ELSEIF p_kind='creators' THEN SELECT user_id INTO v_user FROM creators WHERE id=p_id;
  ELSE SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_KIND'; END IF;
  IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_NOT_FOUND'; END IF;
  SELECT status INTO v_old FROM users WHERE id=v_user FOR UPDATE;
  IF p_status NOT IN ('ACTIVE','INACTIVE','SUSPENDED') OR CHAR_LENGTH(TRIM(p_reason))<3 OR p_reason IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_STATUS'; END IF;
  IF v_old='DELETED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_STATE_CONFLICT'; END IF;
  IF v_old<>p_status THEN
    UPDATE users SET status=p_status,auth_version=auth_version+1 WHERE id=v_user;
    UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(6)) WHERE user_id=v_user;
    INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'ACCOUNT_STATUS_CHANGED',p_kind,p_id,p_request,JSON_OBJECT('from',v_old,'to',p_status,'reason',p_reason));
  END IF;
  COMMIT;
  CALL sp_admin_get_account(p_kind,p_id);
END$$
DROP PROCEDURE IF EXISTS sp_admin_verify_creator$$
CREATE PROCEDURE sp_admin_verify_creator(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_status VARCHAR(16),IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_old VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_admin_assert(p_actor);
  SELECT verification_status INTO v_old FROM creators WHERE id=p_id FOR UPDATE;
  IF v_old IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_NOT_FOUND'; END IF;
  IF p_status NOT IN ('PENDING','UNDER_REVIEW','VERIFIED','REJECTED') OR CHAR_LENGTH(TRIM(p_reason))<3 OR p_reason IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_VERIFICATION'; END IF;
  IF v_old<>p_status THEN
    IF NOT ((v_old='PENDING' AND p_status IN ('UNDER_REVIEW','VERIFIED','REJECTED')) OR (v_old='UNDER_REVIEW' AND p_status IN ('VERIFIED','REJECTED')) OR (v_old IN ('VERIFIED','REJECTED') AND p_status='UNDER_REVIEW')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_STATE_CONFLICT'; END IF;
    UPDATE creators SET verification_status=p_status WHERE id=p_id;
    INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CREATOR_VERIFICATION_CHANGED','creators',p_id,p_request,JSON_OBJECT('from',v_old,'to',p_status,'reason',p_reason));
  END IF;
  COMMIT;
  CALL sp_admin_get_account('creators',p_id);
END$$
DROP PROCEDURE IF EXISTS sp_admin_list_catalog$$
CREATE PROCEDURE sp_admin_list_catalog(IN p_kind VARCHAR(32),IN p_search VARCHAR(300),IN p_active TINYINT,IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  IF p_kind='categories' THEN
    SELECT c.id,c.name,c.parent_id AS parentId,p.name AS parentName,c.is_active AS isActive FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE (p_active IS NULL OR c.is_active=p_active) AND (p_search='' OR c.name LIKE CONCAT('%',p_search,'%') ESCAPE '=') ORDER BY c.id DESC LIMIT p_limit OFFSET p_offset;
    SELECT COUNT(*) AS total FROM categories WHERE (p_active IS NULL OR is_active=p_active) AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=');
  ELSEIF p_kind='platforms' THEN
    SELECT id,code,name,is_active AS isActive FROM platforms WHERE (p_active IS NULL OR is_active=p_active) AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR code LIKE CONCAT('%',p_search,'%') ESCAPE '=') ORDER BY id LIMIT p_limit OFFSET p_offset;
    SELECT COUNT(*) AS total FROM platforms WHERE (p_active IS NULL OR is_active=p_active) AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR code LIKE CONCAT('%',p_search,'%') ESCAPE '=');
  ELSEIF p_kind='content-types' THEN
    SELECT id,code,name,is_active AS isActive FROM content_types WHERE (p_active IS NULL OR is_active=p_active) AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR code LIKE CONCAT('%',p_search,'%') ESCAPE '=') ORDER BY id LIMIT p_limit OFFSET p_offset;
    SELECT COUNT(*) AS total FROM content_types WHERE (p_active IS NULL OR is_active=p_active) AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR code LIKE CONCAT('%',p_search,'%') ESCAPE '=');
  ELSE SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_KIND'; END IF;
END$$
DROP PROCEDURE IF EXISTS sp_admin_save_catalog$$
CREATE PROCEDURE sp_admin_save_catalog(IN p_actor CHAR(36),IN p_kind VARCHAR(32),IN p_id INT,IN p_name VARCHAR(120),IN p_code VARCHAR(32),IN p_parent INT,IN p_active BOOLEAN,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_id INT;
  DECLARE v_parent INT;
  DECLARE v_parent_active BOOLEAN;
  DECLARE v_parent_found INT;
  DECLARE v_old JSON;
  DECLARE v_new JSON;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  CALL sp_admin_assert(p_actor);
  IF CHAR_LENGTH(TRIM(p_name))<2 OR p_name IS NULL OR p_active IS NULL OR (p_id IS NOT NULL AND (p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<3)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_CATALOG'; END IF;
  IF p_kind='categories' THEN
    IF p_id IS NOT NULL THEN SELECT id,JSON_OBJECT('name',name,'parentId',parent_id,'isActive',is_active) INTO v_id,v_old FROM categories WHERE id=p_id FOR UPDATE;
      IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_NOT_FOUND'; END IF;
    END IF;
    IF p_parent IS NOT NULL THEN
      SELECT id,parent_id,is_active INTO v_parent_found,v_parent,v_parent_active FROM categories WHERE id=p_parent;
      IF v_parent_found IS NULL OR v_parent IS NOT NULL OR p_parent=p_id OR (p_active=TRUE AND v_parent_active=FALSE) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_PARENT'; END IF;
      IF p_id IS NOT NULL AND EXISTS(SELECT 1 FROM categories WHERE parent_id=p_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_PARENT'; END IF;
    END IF;
    IF p_active=FALSE AND p_id IS NOT NULL AND EXISTS(SELECT 1 FROM categories WHERE parent_id=p_id AND is_active=TRUE) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_ACTIVE_CHILDREN'; END IF;
    IF p_id IS NULL THEN INSERT INTO categories(name,parent_id,is_active) VALUES(p_name,p_parent,p_active); SET v_id=LAST_INSERT_ID();
    ELSE UPDATE categories SET name=p_name,parent_id=p_parent,is_active=p_active WHERE id=p_id; END IF;
    SELECT JSON_OBJECT('name',name,'parentId',parent_id,'isActive',is_active) INTO v_new FROM categories WHERE id=v_id;
  ELSEIF p_kind IN ('platforms','content-types') THEN
    IF p_code IS NULL OR p_code NOT REGEXP '^[A-Z][A-Z0-9_]{1,31}$' OR CHAR_LENGTH(p_name)>60 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_CATALOG'; END IF;
    IF p_kind='platforms' THEN
      IF p_id IS NOT NULL THEN SELECT id,JSON_OBJECT('name',name,'code',code,'isActive',is_active) INTO v_id,v_old FROM platforms WHERE id=p_id FOR UPDATE; END IF;
      IF p_id IS NOT NULL AND v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_NOT_FOUND'; END IF;
      IF p_id IS NULL THEN INSERT INTO platforms(code,name,is_active) VALUES(p_code,p_name,p_active); SET v_id=LAST_INSERT_ID();
      ELSE UPDATE platforms SET code=p_code,name=p_name,is_active=p_active WHERE id=p_id; END IF;
      SELECT JSON_OBJECT('name',name,'code',code,'isActive',is_active) INTO v_new FROM platforms WHERE id=v_id;
    ELSE
      IF p_id IS NOT NULL THEN SELECT id,JSON_OBJECT('name',name,'code',code,'isActive',is_active) INTO v_id,v_old FROM content_types WHERE id=p_id FOR UPDATE; END IF;
      IF p_id IS NOT NULL AND v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_NOT_FOUND'; END IF;
      IF p_id IS NULL THEN INSERT INTO content_types(code,name,is_active) VALUES(p_code,p_name,p_active); SET v_id=LAST_INSERT_ID();
      ELSE UPDATE content_types SET code=p_code,name=p_name,is_active=p_active WHERE id=p_id; END IF;
      SELECT JSON_OBJECT('name',name,'code',code,'isActive',is_active) INTO v_new FROM content_types WHERE id=v_id;
    END IF;
  ELSE SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_KIND'; END IF;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,IF(p_id IS NULL,'CATALOG_CREATED','CATALOG_UPDATED'),p_kind,CAST(v_id AS CHAR),p_request,JSON_OBJECT('before',v_old,'after',v_new,'reason',p_reason));
  COMMIT;
  SELECT v_id AS id;
END$$
DROP PROCEDURE IF EXISTS sp_admin_list_audit$$
CREATE PROCEDURE sp_admin_list_audit(IN p_action VARCHAR(100),IN p_entity VARCHAR(60),IN p_entity_id VARCHAR(36),IN p_start DATETIME,IN p_end DATETIME,IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  SELECT a.id,a.actor_user_id AS actorUserId,u.name AS actorName,a.action,a.entity_type AS entityType,a.entity_id AS entityId,a.request_id AS requestId,a.metadata,a.created_at AS createdAt
  FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
  WHERE (p_action IS NULL OR a.action=p_action) AND (p_entity IS NULL OR a.entity_type=p_entity) AND (p_entity_id IS NULL OR a.entity_id=p_entity_id) AND (p_start IS NULL OR a.created_at>=p_start) AND (p_end IS NULL OR a.created_at<p_end)
  ORDER BY a.created_at DESC,a.id DESC LIMIT p_limit OFFSET p_offset;
  SELECT COUNT(*) AS total FROM audit_logs a WHERE (p_action IS NULL OR a.action=p_action) AND (p_entity IS NULL OR a.entity_type=p_entity) AND (p_entity_id IS NULL OR a.entity_id=p_entity_id) AND (p_start IS NULL OR a.created_at>=p_start) AND (p_end IS NULL OR a.created_at<p_end);
END$$
DROP PROCEDURE IF EXISTS sp_admin_get_catalog$$
CREATE PROCEDURE sp_admin_get_catalog(IN p_kind VARCHAR(32),IN p_id INT)
SQL SECURITY INVOKER
BEGIN
  IF p_kind='categories' THEN
    SELECT c.id,c.name,c.parent_id AS parentId,p.name AS parentName,c.is_active AS isActive FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.id=p_id;
  ELSEIF p_kind='platforms' THEN SELECT id,code,name,is_active AS isActive FROM platforms WHERE id=p_id;
  ELSEIF p_kind='content-types' THEN SELECT id,code,name,is_active AS isActive FROM content_types WHERE id=p_id;
  ELSE SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_KIND'; END IF;
END$$
DELIMITER ;
