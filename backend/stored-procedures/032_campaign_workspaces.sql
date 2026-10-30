DELIMITER $$
DROP PROCEDURE IF EXISTS sp_workspace_actor$$
CREATE PROCEDURE sp_workspace_actor(IN p_actor CHAR(36),IN p_role VARCHAR(20))
SQL SECURITY INVOKER
BEGIN
 IF p_role='CREATOR' THEN CALL sp_creator_discovery_assert(p_actor);
 ELSEIF p_role='BRAND_ADMIN' THEN
  IF NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=p_actor AND u.status='ACTIVE' AND r.code='BRAND_ADMIN') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN';END IF;
 ELSE SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN';END IF;
END$$
DROP PROCEDURE IF EXISTS sp_workspace_assert$$
CREATE PROCEDURE sp_workspace_assert(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 CALL sp_workspace_actor(p_actor,p_role);
 IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_id AND
 ((p_role='BRAND_ADMIN' AND b.user_id=p_actor AND EXISTS(SELECT 1 FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id WHERE x.campaign_id=c.id AND a.status='APPROVED')) OR
 (p_role='CREATOR' AND EXISTS(SELECT 1 FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id JOIN creators cr ON cr.id=x.creator_id WHERE x.campaign_id=c.id AND a.status='APPROVED' AND cr.user_id=p_actor)))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
END$$
DROP PROCEDURE IF EXISTS sp_campaign_workspaces$$
CREATE PROCEDURE sp_campaign_workspaces(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_status VARCHAR(24),IN p_q VARCHAR(100),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_actor(p_actor,p_role);
 SELECT c.id,c.title,c.status,b.company_name AS companyName,s.start_at AS startAt,s.content_deadline AS contentDeadline,s.end_at AS endAt,
 (SELECT COUNT(*) FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id WHERE x.campaign_id=c.id AND a.status='APPROVED') AS allocatedSlots
 FROM campaigns c JOIN brands b ON b.id=c.brand_id LEFT JOIN campaign_schedules s ON s.campaign_id=c.id
 WHERE (p_status IS NULL OR c.status=p_status) AND (p_q='' OR LOCATE(p_q,c.title)>0 OR LOCATE(p_q,b.company_name)>0)
 AND EXISTS(SELECT 1 FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id JOIN creators cr ON cr.id=x.creator_id WHERE x.campaign_id=c.id AND a.status='APPROVED' AND ((p_role='BRAND_ADMIN' AND b.user_id=p_actor) OR (p_role='CREATOR' AND cr.user_id=p_actor)))
 ORDER BY c.updated_at DESC,c.id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM campaigns c JOIN brands b ON b.id=c.brand_id
 WHERE (p_status IS NULL OR c.status=p_status) AND (p_q='' OR LOCATE(p_q,c.title)>0 OR LOCATE(p_q,b.company_name)>0)
 AND EXISTS(SELECT 1 FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id JOIN creators cr ON cr.id=x.creator_id WHERE x.campaign_id=c.id AND a.status='APPROVED' AND ((p_role='BRAND_ADMIN' AND b.user_id=p_actor) OR (p_role='CREATOR' AND cr.user_id=p_actor)));
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_campaign_workspace$$
CREATE PROCEDURE sp_campaign_workspace(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_assert(p_actor,p_role,p_id);
 SELECT c.id,c.title,c.status,c.description,c.requirements,c.total_budget AS totalBudget,c.currency,c.creator_slots AS creatorSlots,b.company_name AS companyName,
 s.applications_open_at AS applicationsOpenAt,s.application_deadline AS applicationDeadline,s.start_at AS startAt,s.content_deadline AS contentDeadline,s.end_at AS endAt
 FROM campaigns c JOIN brands b ON b.id=c.brand_id LEFT JOIN campaign_schedules s ON s.campaign_id=c.id WHERE c.id=p_id;
 SELECT d.id,p.name AS platformName,t.name AS contentTypeName,d.quantity,d.description FROM campaign_deliverables d JOIN platforms p ON p.id=d.platform_id JOIN content_types t ON t.id=d.content_type_id WHERE d.campaign_id=p_id ORDER BY d.id;
 SELECT f.id,f.kind,f.title,f.mime_type AS mimeType,f.byte_size AS byteSize FROM campaign_files f WHERE f.campaign_id=p_id ORDER BY f.kind,f.title,f.id;
 SELECT a.id AS applicationId,u.name AS creatorName,u.status AS accountStatus,x.allocated_at AS allocatedAt,a.status AS applicationStatus
 FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id JOIN creators cr ON cr.id=x.creator_id JOIN users u ON u.id=cr.user_id
 WHERE x.campaign_id=p_id AND a.status='APPROVED' AND (p_role='BRAND_ADMIN' OR cr.user_id=p_actor) ORDER BY x.allocated_at,a.id;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_campaign_workspace_file$$
CREATE PROCEDURE sp_campaign_workspace_file(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_id CHAR(36),IN p_file CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_workspace_assert(p_actor,p_role,p_id);
 IF NOT EXISTS(SELECT 1 FROM campaign_files WHERE id=p_file AND campaign_id=p_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_FILE_NOT_FOUND';END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'WORKSPACE_FILE_READ','campaign_files',p_file,p_request,JSON_OBJECT('campaignId',p_id));
 SELECT id,kind,mime_type AS mimeType,file_content AS fileContent FROM campaign_files WHERE id=p_file AND campaign_id=p_id;
 COMMIT;
END$$
DELIMITER ;
