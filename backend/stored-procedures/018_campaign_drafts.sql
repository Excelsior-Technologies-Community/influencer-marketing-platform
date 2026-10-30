DELIMITER $$
DROP PROCEDURE IF EXISTS sp_get_campaign$$
CREATE PROCEDURE sp_get_campaign(IN p_actor CHAR(36),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_brand CHAR(36);
  SELECT b.id INTO v_brand FROM brands b JOIN users u ON u.id=b.user_id WHERE u.id=p_actor AND u.role_id=2 AND u.status='ACTIVE';
  IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN'; END IF;
  START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_id AND brand_id=v_brand) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND'; END IF;
    SELECT id,title,description,total_budget AS totalBudget,currency,creator_slots AS creatorSlots,requirements,status,revision,created_at AS createdAt,updated_at AS updatedAt FROM campaigns WHERE id=p_id AND brand_id=v_brand;
    SELECT p.id,p.name,p.code,p.is_active AS isAvailable FROM campaign_platforms cp JOIN platforms p ON p.id=cp.platform_id WHERE cp.campaign_id=p_id ORDER BY p.name,p.id;
    SELECT c.id,c.name,parent.name AS parentName,(c.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) AS isAvailable FROM campaign_categories cc JOIN categories c ON c.id=cc.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE cc.campaign_id=p_id ORDER BY c.name,c.id;
    SELECT t.id,t.name,t.code,t.is_active AS isAvailable FROM campaign_content_types ct JOIN content_types t ON t.id=ct.content_type_id WHERE ct.campaign_id=p_id ORDER BY t.name,t.id;
    SELECT d.platform_id AS platformId,p.name AS platformName,d.content_type_id AS contentTypeId,t.name AS contentTypeName,d.quantity,d.description FROM campaign_deliverables d JOIN platforms p ON p.id=d.platform_id JOIN content_types t ON t.id=d.content_type_id WHERE d.campaign_id=p_id ORDER BY p.name,t.name;
    COMMIT;
  END;
END$$
DROP PROCEDURE IF EXISTS sp_get_campaigns$$
CREATE PROCEDURE sp_get_campaigns(IN p_actor CHAR(36),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  DECLARE v_brand CHAR(36);
  SELECT b.id INTO v_brand FROM brands b JOIN users u ON u.id=b.user_id WHERE u.id=p_actor AND u.role_id=2 AND u.status='ACTIVE';
  IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN'; END IF;
  SELECT id,title,status,total_budget AS totalBudget,currency,creator_slots AS creatorSlots,revision,updated_at AS updatedAt FROM campaigns WHERE brand_id=v_brand AND status='DRAFT' ORDER BY updated_at DESC,id LIMIT p_limit OFFSET p_offset;
  SELECT COUNT(*) AS total FROM campaigns WHERE brand_id=v_brand AND status='DRAFT';
END$$
DROP PROCEDURE IF EXISTS sp_campaign_catalogs$$
CREATE PROCEDURE sp_campaign_catalogs(IN p_actor CHAR(36),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_brand CHAR(36);
  SELECT b.id INTO v_brand FROM brands b JOIN users u ON u.id=b.user_id WHERE u.id=p_actor AND u.role_id=2 AND u.status='ACTIVE';
  IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN'; END IF;
  IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_id AND brand_id=v_brand) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND'; END IF;
  SELECT p.id,p.name,p.code,p.is_active AS isAvailable FROM platforms p WHERE p.is_active=TRUE OR EXISTS(SELECT 1 FROM campaign_platforms cp WHERE cp.campaign_id=p_id AND cp.platform_id=p.id) ORDER BY p.name,p.id;
  SELECT c.id,c.name,parent.name AS parentName,(c.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) AS isAvailable FROM categories c LEFT JOIN categories parent ON parent.id=c.parent_id WHERE (c.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) OR EXISTS(SELECT 1 FROM campaign_categories cc WHERE cc.campaign_id=p_id AND cc.category_id=c.id) ORDER BY c.name,c.id;
  SELECT t.id,t.name,t.code,t.is_active AS isAvailable FROM content_types t WHERE t.is_active=TRUE OR EXISTS(SELECT 1 FROM campaign_content_types ct WHERE ct.campaign_id=p_id AND ct.content_type_id=t.id) ORDER BY t.name,t.id;
END$$
DROP PROCEDURE IF EXISTS sp_save_campaign_draft$$
CREATE PROCEDURE sp_save_campaign_draft(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_create BOOLEAN,IN p_title VARCHAR(160),IN p_description TEXT,IN p_budget DECIMAL(11,2),IN p_currency CHAR(3),IN p_slots INT,IN p_requirements TEXT,IN p_links JSON,IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_guard INT; DECLARE v_brand CHAR(36); DECLARE v_revision INT; DECLARE v_status VARCHAR(32);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
  CALL sp_brand_assert(p_actor,v_brand);
  IF NOT p_create THEN
    SELECT revision,status INTO v_revision,v_status FROM campaigns WHERE id=p_id AND brand_id=v_brand FOR UPDATE;
    IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND'; END IF;
    IF v_status<>'DRAFT' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_DRAFT'; END IF;
    IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_CONFLICT'; END IF;
  END IF;
  IF p_title IS NULL OR CHAR_LENGTH(TRIM(p_title))<3 OR CHAR_LENGTH(COALESCE(p_description,''))>5000 OR CHAR_LENGTH(COALESCE(p_requirements,''))>3000 OR p_slots IS NULL OR p_slots<1 OR p_slots>10000 OR p_currency IS NULL OR p_currency NOT IN ('INR','USD','EUR','GBP') OR (p_budget IS NOT NULL AND p_budget<=0) OR p_links IS NULL OR JSON_TYPE(p_links)<>'OBJECT' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_INVALID'; END IF;
  IF JSON_TYPE(JSON_EXTRACT(p_links,'$.platformIds'))<>'ARRAY' OR JSON_TYPE(JSON_EXTRACT(p_links,'$.categoryIds'))<>'ARRAY' OR JSON_TYPE(JSON_EXTRACT(p_links,'$.contentTypeIds'))<>'ARRAY' OR JSON_TYPE(JSON_EXTRACT(p_links,'$.deliverables'))<>'ARRAY' OR JSON_LENGTH(p_links,'$.platformIds')>10 OR JSON_LENGTH(p_links,'$.categoryIds')>10 OR JSON_LENGTH(p_links,'$.contentTypeIds')>10 OR JSON_LENGTH(p_links,'$.deliverables')>20 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM JSON_TABLE(p_links,'$.platformIds[*]' COLUMNS(id INT PATH '$')) x LEFT JOIN platforms p ON p.id=x.id LEFT JOIN campaign_platforms old ON old.campaign_id=p_id AND old.platform_id=p.id WHERE p.id IS NULL OR (p.is_active=FALSE AND (p_create OR old.platform_id IS NULL))) OR
    EXISTS(SELECT 1 FROM JSON_TABLE(p_links,'$.contentTypeIds[*]' COLUMNS(id INT PATH '$')) x LEFT JOIN content_types t ON t.id=x.id LEFT JOIN campaign_content_types old ON old.campaign_id=p_id AND old.content_type_id=t.id WHERE t.id IS NULL OR (t.is_active=FALSE AND (p_create OR old.content_type_id IS NULL))) OR
    EXISTS(SELECT 1 FROM JSON_TABLE(p_links,'$.categoryIds[*]' COLUMNS(id INT PATH '$')) x LEFT JOIN categories c ON c.id=x.id LEFT JOIN categories parent ON parent.id=c.parent_id LEFT JOIN campaign_categories old ON old.campaign_id=p_id AND old.category_id=c.id WHERE c.id IS NULL OR ((c.is_active=FALSE OR (parent.id IS NOT NULL AND parent.is_active=FALSE)) AND (p_create OR old.category_id IS NULL))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_INVALID_CATALOG'; END IF;
  IF EXISTS(SELECT 1 FROM JSON_TABLE(p_links,'$.deliverables[*]' COLUMNS(platform_id INT PATH '$.platformId',content_type_id INT PATH '$.contentTypeId',quantity INT PATH '$.quantity')) d WHERE d.quantity IS NULL OR d.quantity<1 OR d.quantity>100 OR NOT EXISTS(SELECT 1 FROM JSON_TABLE(p_links,'$.platformIds[*]' COLUMNS(id INT PATH '$')) p WHERE p.id=d.platform_id) OR NOT EXISTS(SELECT 1 FROM JSON_TABLE(p_links,'$.contentTypeIds[*]' COLUMNS(id INT PATH '$')) t WHERE t.id=d.content_type_id)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_INVALID'; END IF;
  IF p_create THEN INSERT INTO campaigns(id,brand_id,title,description,total_budget,currency,creator_slots,requirements) VALUES(p_id,v_brand,p_title,p_description,p_budget,p_currency,p_slots,p_requirements);
  ELSE UPDATE campaigns SET title=p_title,description=p_description,total_budget=p_budget,currency=p_currency,creator_slots=p_slots,requirements=p_requirements,revision=revision+1 WHERE id=p_id AND brand_id=v_brand; END IF;
  DELETE FROM campaign_deliverables WHERE campaign_id=p_id;
  DELETE FROM campaign_platforms WHERE campaign_id=p_id;
  DELETE FROM campaign_categories WHERE campaign_id=p_id;
  DELETE FROM campaign_content_types WHERE campaign_id=p_id;
  INSERT INTO campaign_platforms SELECT p_id,id FROM JSON_TABLE(p_links,'$.platformIds[*]' COLUMNS(id INT PATH '$')) x;
  INSERT INTO campaign_categories SELECT p_id,id FROM JSON_TABLE(p_links,'$.categoryIds[*]' COLUMNS(id INT PATH '$')) x;
  INSERT INTO campaign_content_types SELECT p_id,id FROM JSON_TABLE(p_links,'$.contentTypeIds[*]' COLUMNS(id INT PATH '$')) x;
  INSERT INTO campaign_deliverables SELECT p_id,platform_id,content_type_id,quantity,description FROM JSON_TABLE(p_links,'$.deliverables[*]' COLUMNS(platform_id INT PATH '$.platformId',content_type_id INT PATH '$.contentTypeId',quantity INT PATH '$.quantity',description VARCHAR(1000) PATH '$.description' NULL ON EMPTY)) x;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,IF(p_create,'CAMPAIGN_DRAFT_CREATED','CAMPAIGN_DRAFT_UPDATED'),'campaigns',p_id,p_request,JSON_OBJECT('revision',IFNULL(v_revision,0)+1,'platformCount',JSON_LENGTH(p_links,'$.platformIds'),'categoryCount',JSON_LENGTH(p_links,'$.categoryIds'),'deliverableCount',JSON_LENGTH(p_links,'$.deliverables')));
  COMMIT;
END$$
DELIMITER ;
