DELIMITER $$
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
 SELECT CONCAT(d.platform_id,':',d.content_type_id) AS id,p.name AS platformName,t.name AS contentTypeName,d.quantity,d.description FROM campaign_deliverables d JOIN platforms p ON p.id=d.platform_id JOIN content_types t ON t.id=d.content_type_id WHERE d.campaign_id=p_id ORDER BY d.platform_id,d.content_type_id;
 SELECT f.id,f.kind,f.title,f.mime_type AS mimeType,f.byte_size AS byteSize FROM campaign_files f WHERE f.campaign_id=p_id ORDER BY f.kind,f.title,f.id;
 SELECT a.id AS applicationId,u.name AS creatorName,u.status AS accountStatus,x.allocated_at AS allocatedAt,a.status AS applicationStatus
 FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id JOIN creators cr ON cr.id=x.creator_id JOIN users u ON u.id=cr.user_id
 WHERE x.campaign_id=p_id AND a.status='APPROVED' AND (p_role='BRAND_ADMIN' OR cr.user_id=p_actor) ORDER BY x.allocated_at,a.id;
 COMMIT;
 END;
END$$
DELIMITER ;
