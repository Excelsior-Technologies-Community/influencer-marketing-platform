-- Keep inactive integration-test platform rows for historical references, but
-- remove their generated names from the Super Admin catalog directory.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_admin_list_catalog$$
CREATE PROCEDURE sp_admin_list_catalog(IN p_kind VARCHAR(32),IN p_search VARCHAR(300),IN p_active TINYINT,IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  IF p_kind='categories' THEN
    SELECT c.id,c.name,c.parent_id AS parentId,p.name AS parentName,c.is_active AS isActive FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE (p_active IS NULL OR c.is_active=p_active) AND (p_search='' OR c.name LIKE CONCAT('%',p_search,'%') ESCAPE '=') ORDER BY c.id DESC LIMIT p_limit OFFSET p_offset;
    SELECT COUNT(*) AS total FROM categories WHERE (p_active IS NULL OR is_active=p_active) AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=');
  ELSEIF p_kind='platforms' THEN
    SELECT id,code,name,is_active AS isActive FROM platforms
    WHERE NOT (name LIKE 'applications-% platform' AND code REGEXP '^L_[0-9a-f]{20}$')
      AND (p_active IS NULL OR is_active=p_active)
      AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR code LIKE CONCAT('%',p_search,'%') ESCAPE '=')
    ORDER BY id LIMIT p_limit OFFSET p_offset;
    SELECT COUNT(*) AS total FROM platforms
    WHERE NOT (name LIKE 'applications-% platform' AND code REGEXP '^L_[0-9a-f]{20}$')
      AND (p_active IS NULL OR is_active=p_active)
      AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR code LIKE CONCAT('%',p_search,'%') ESCAPE '=');
  ELSEIF p_kind='content-types' THEN
    SELECT id,code,name,is_active AS isActive FROM content_types WHERE (p_active IS NULL OR is_active=p_active) AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR code LIKE CONCAT('%',p_search,'%') ESCAPE '=') ORDER BY id LIMIT p_limit OFFSET p_offset;
    SELECT COUNT(*) AS total FROM content_types WHERE (p_active IS NULL OR is_active=p_active) AND (p_search='' OR name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR code LIKE CONCAT('%',p_search,'%') ESCAPE '=');
  ELSE SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_INVALID_KIND'; END IF;
END$$
DELIMITER ;

INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata)
SELECT NULL,'SYNTHETIC_CATALOG_ENTRY_HIDDEN','platforms',CAST(p.id AS CHAR),NULL,
       JSON_OBJECT('reason','Hidden generated inactive application-test platform; related social-account and campaign history retained.')
FROM platforms p
WHERE p.name LIKE 'applications-% platform'
  AND p.code REGEXP '^L_[0-9a-f]{20}$'
  AND p.is_active=FALSE;
