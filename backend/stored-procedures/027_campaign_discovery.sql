DELIMITER $$
DROP PROCEDURE IF EXISTS sp_creator_discovery_assert$$
CREATE PROCEDURE sp_creator_discovery_assert(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users u JOIN creators c ON c.user_id=u.id WHERE u.id=p_actor AND u.role_id=3 AND u.status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN';END IF;
END$$
DROP PROCEDURE IF EXISTS sp_creator_campaign_catalogs$$
CREATE PROCEDURE sp_creator_campaign_catalogs(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
 CALL sp_creator_discovery_assert(p_actor);
 SELECT id,name,code FROM platforms WHERE is_active=TRUE ORDER BY name,id;
 SELECT c.id,c.name,c.parent_id AS parentId,p.name AS parentName FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.is_active=TRUE AND (p.id IS NULL OR p.is_active=TRUE) ORDER BY COALESCE(p.name,c.name),c.name,c.id;
 SELECT id,name,code FROM content_types WHERE is_active=TRUE ORDER BY name,id;
END$$
DROP PROCEDURE IF EXISTS sp_creator_discover_campaigns$$
CREATE PROCEDURE sp_creator_discover_campaigns(IN p_actor CHAR(36),IN p_q VARCHAR(100),IN p_platform INT,IN p_category INT,IN p_type INT,IN p_currency CHAR(3),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_creator_discovery_assert(p_actor);
 SELECT c.id,c.title,c.company_name AS companyName,LEFT(c.description,240) AS summary,c.total_budget AS totalBudget,c.currency,c.creator_slots AS creatorSlots,c.application_deadline AS applicationDeadline,c.start_at AS startAt,c.end_at AS endAt,
 (SELECT JSON_ARRAYAGG(JSON_OBJECT('id',p.id,'name',p.name)) FROM campaign_platforms x JOIN platforms p ON p.id=x.platform_id WHERE x.campaign_id=c.id) AS platforms,
 (SELECT JSON_ARRAYAGG(JSON_OBJECT('id',k.id,'name',k.name)) FROM campaign_categories x JOIN categories k ON k.id=x.category_id WHERE x.campaign_id=c.id) AS categories,
 (SELECT JSON_ARRAYAGG(JSON_OBJECT('id',t.id,'name',t.name)) FROM campaign_content_types x JOIN content_types t ON t.id=x.content_type_id WHERE x.campaign_id=c.id) AS contentTypes
 FROM creator_discoverable_campaigns c WHERE (p_q='' OR LOCATE(p_q,c.title)>0 OR LOCATE(p_q,c.company_name)>0)
 AND (p_platform IS NULL OR EXISTS(SELECT 1 FROM campaign_platforms x WHERE x.campaign_id=c.id AND x.platform_id=p_platform))
 AND (p_category IS NULL OR EXISTS(SELECT 1 FROM campaign_categories x JOIN categories k ON k.id=x.category_id WHERE x.campaign_id=c.id AND (k.id=p_category OR k.parent_id=p_category)))
 AND (p_type IS NULL OR EXISTS(SELECT 1 FROM campaign_content_types x WHERE x.campaign_id=c.id AND x.content_type_id=p_type))
 AND (p_currency IS NULL OR c.currency=p_currency) ORDER BY c.updated_at DESC,c.id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM creator_discoverable_campaigns c WHERE (p_q='' OR LOCATE(p_q,c.title)>0 OR LOCATE(p_q,c.company_name)>0)
 AND (p_platform IS NULL OR EXISTS(SELECT 1 FROM campaign_platforms x WHERE x.campaign_id=c.id AND x.platform_id=p_platform))
 AND (p_category IS NULL OR EXISTS(SELECT 1 FROM campaign_categories x JOIN categories k ON k.id=x.category_id WHERE x.campaign_id=c.id AND (k.id=p_category OR k.parent_id=p_category)))
 AND (p_type IS NULL OR EXISTS(SELECT 1 FROM campaign_content_types x WHERE x.campaign_id=c.id AND x.content_type_id=p_type))
 AND (p_currency IS NULL OR c.currency=p_currency);
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_creator_campaign_detail$$
CREATE PROCEDURE sp_creator_campaign_detail(IN p_actor CHAR(36),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_creator_discovery_assert(p_actor);
 IF NOT EXISTS(SELECT 1 FROM creator_discoverable_campaigns WHERE id=p_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT id,title,description,total_budget AS totalBudget,currency,creator_slots AS creatorSlots,requirements,company_name AS companyName,applications_open_at AS applicationsOpenAt,application_deadline AS applicationDeadline,start_at AS startAt,content_deadline AS contentDeadline,end_at AS endAt FROM creator_discoverable_campaigns WHERE id=p_id;
 SELECT p.id,p.name FROM campaign_platforms x JOIN platforms p ON p.id=x.platform_id WHERE x.campaign_id=p_id ORDER BY p.name,p.id;
 SELECT c.id,c.name,parent.name AS parentName FROM campaign_categories x JOIN categories c ON c.id=x.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE x.campaign_id=p_id ORDER BY c.name,c.id;
 SELECT t.id,t.name FROM campaign_content_types x JOIN content_types t ON t.id=x.content_type_id WHERE x.campaign_id=p_id ORDER BY t.name,t.id;
 SELECT p.name AS platformName,t.name AS contentTypeName,d.quantity,d.description FROM campaign_deliverables d JOIN platforms p ON p.id=d.platform_id JOIN content_types t ON t.id=d.content_type_id WHERE d.campaign_id=p_id ORDER BY p.name,t.name;
 SELECT id,kind,title,mime_type AS mimeType,byte_size AS byteSize,page_count AS pageCount FROM campaign_files WHERE campaign_id=p_id ORDER BY kind,title,id;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_creator_campaign_file$$
CREATE PROCEDURE sp_creator_campaign_file(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_file CHAR(36))
SQL SECURITY INVOKER
BEGIN
 CALL sp_creator_discovery_assert(p_actor);
 SELECT f.id,f.kind,f.mime_type AS mimeType,f.file_content AS fileContent FROM campaign_files f JOIN creator_discoverable_campaigns c ON c.id=f.campaign_id WHERE f.id=p_file AND f.campaign_id=p_id;
END$$
DELIMITER ;
