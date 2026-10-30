DELIMITER $$
DROP PROCEDURE IF EXISTS sp_brand_applicants_assert$$
CREATE PROCEDURE sp_brand_applicants_assert(IN p_actor CHAR(36),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=2 AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN';END IF;
 IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_campaign AND b.user_id=p_actor) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
END$$
DROP PROCEDURE IF EXISTS sp_brand_campaign_applicants$$
CREATE PROCEDURE sp_brand_campaign_applicants(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_status VARCHAR(24),IN p_q VARCHAR(100),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_brand_applicants_assert(p_actor,p_campaign);
 SELECT c.id,c.title,c.status,c.creator_slots AS creatorSlots,
 (SELECT COUNT(*) FROM campaign_applications a WHERE a.campaign_id=c.id AND (a.status='APPROVED' OR EXISTS(SELECT 1 FROM campaign_creator_allocations x WHERE x.application_id=a.id))) AS allocatedSlots,
 s.start_at AS startAt,EXISTS(SELECT 1 FROM campaign_applicant_review_windows w WHERE w.id=c.id) AS reviewOpen FROM campaigns c LEFT JOIN campaign_schedules s ON s.campaign_id=c.id WHERE c.id=p_campaign;
 SELECT a.id,u.name AS creatorName,u.status AS accountStatus,cr.verification_status AS verificationStatus,cr.location,a.status,a.revision,a.created_at AS createdAt,a.updated_at AS updatedAt FROM campaign_applications a JOIN creators cr ON cr.id=a.creator_id JOIN users u ON u.id=cr.user_id WHERE a.campaign_id=p_campaign AND (p_status IS NULL OR a.status=p_status) AND (p_q='' OR LOCATE(p_q,u.name)>0 OR LOCATE(p_q,COALESCE(cr.location,''))>0) ORDER BY a.updated_at DESC,a.id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM campaign_applications a JOIN creators cr ON cr.id=a.creator_id JOIN users u ON u.id=cr.user_id WHERE a.campaign_id=p_campaign AND (p_status IS NULL OR a.status=p_status) AND (p_q='' OR LOCATE(p_q,u.name)>0 OR LOCATE(p_q,COALESCE(cr.location,''))>0);
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_brand_applicant_detail$$
CREATE PROCEDURE sp_brand_applicant_detail(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_application CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_creator CHAR(36);
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_brand_applicants_assert(p_actor,p_campaign);
 SELECT creator_id INTO v_creator FROM campaign_applications WHERE id=p_application AND campaign_id=p_campaign;
 IF v_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_NOT_FOUND';END IF;
 SELECT a.id,a.campaign_id AS campaignId,c.title AS campaignTitle,c.status AS campaignStatus,a.pitch,a.status,a.revision,a.created_at AS createdAt,
 EXISTS(SELECT 1 FROM campaign_applicant_review_windows w WHERE w.id=c.id) AS reviewOpen,
 EXISTS(SELECT 1 FROM creator_campaign_eligibility e WHERE e.creator_id=a.creator_id AND e.campaign_id=c.id AND e.identity_ready AND e.profile_ready AND e.category_ready AND e.platform_ready) AS eligible,
 c.creator_slots AS creatorSlots,(SELECT COUNT(*) FROM campaign_applications a2 WHERE a2.campaign_id=c.id AND (a2.status='APPROVED' OR EXISTS(SELECT 1 FROM campaign_creator_allocations x WHERE x.application_id=a2.id))) AS allocatedSlots
 FROM campaign_applications a JOIN campaigns c ON c.id=a.campaign_id WHERE a.id=p_application;
 SELECT u.name,u.status AS accountStatus,cr.verification_status AS verificationStatus,cr.bio,cr.location,p.details FROM creators cr JOIN users u ON u.id=cr.user_id LEFT JOIN creator_profiles p ON p.creator_id=cr.id WHERE cr.id=v_creator;
 SELECT k.id,k.name,parent.name AS parentName,(k.is_active AND (parent.id IS NULL OR parent.is_active)) AS isAvailable FROM creator_categories cc JOIN categories k ON k.id=cc.category_id LEFT JOIN categories parent ON parent.id=k.parent_id WHERE cc.creator_id=v_creator ORDER BY k.name,k.id;
 SELECT s.platform_id AS platformId,p.name AS platformName,s.username,s.profile_url AS profileUrl,s.followers_count AS followersCount,s.average_views AS averageViews,s.engagement_rate AS engagementRate,p.is_active AS isAvailable FROM creator_social_accounts s JOIN platforms p ON p.id=s.platform_id WHERE s.creator_id=v_creator ORDER BY p.name,p.id;
 SELECT id,kind,title,mime_type AS mimeType,byte_size AS byteSize FROM creator_assets WHERE creator_id=v_creator AND kind IN ('PHOTO','PORTFOLIO') ORDER BY kind,title,id;
 SELECT id,from_status AS fromStatus,to_status AS toStatus,reason,application_revision AS revision,created_at AS createdAt FROM campaign_application_history WHERE application_id=p_application ORDER BY id;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_brand_applicant_file$$
CREATE PROCEDURE sp_brand_applicant_file(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_application CHAR(36),IN p_file CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_creator CHAR(36);DECLARE v_brand CHAR(36);DECLARE v_guard INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_assert(p_actor,v_brand);
 IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_campaign AND brand_id=v_brand) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT creator_id INTO v_creator FROM campaign_applications WHERE id=p_application AND campaign_id=p_campaign;
 IF v_creator IS NULL OR NOT EXISTS(SELECT 1 FROM creator_assets WHERE creator_id=v_creator AND id=p_file AND kind IN ('PHOTO','PORTFOLIO')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ASSET_NOT_FOUND';END IF;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'APPLICANT_PORTFOLIO_READ','creator_assets',p_file,p_request,JSON_OBJECT('campaignId',p_campaign,'applicationId',p_application));
 SELECT id,kind,mime_type AS mimeType,file_content AS fileContent FROM creator_assets WHERE id=p_file AND creator_id=v_creator AND kind IN ('PHOTO','PORTFOLIO');
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_brand_decide_application$$
CREATE PROCEDURE sp_brand_decide_application(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_application CHAR(36),IN p_decision VARCHAR(20),IN p_revision INT,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_creator CHAR(36);DECLARE v_status VARCHAR(24);DECLARE v_revision INT;DECLARE v_slots INT;DECLARE v_allocated INT;DECLARE v_target VARCHAR(24);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_assert(p_actor,v_brand);
 SELECT creator_slots INTO v_slots FROM campaigns WHERE id=p_campaign AND brand_id=v_brand FOR UPDATE;
 IF v_slots IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT creator_id,status,revision INTO v_creator,v_status,v_revision FROM campaign_applications WHERE id=p_application AND campaign_id=p_campaign FOR UPDATE;
 IF v_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_CONFLICT';END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('SHORTLIST','APPROVE','REJECT') OR p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>500 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICANT_DECISION_INVALID';END IF;
 IF v_status NOT IN ('PENDING','SHORTLISTED') OR (p_decision='SHORTLIST' AND v_status<>'PENDING') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICANT_DECISION_STATE';END IF;
 IF p_decision IN ('SHORTLIST','APPROVE') THEN
  IF NOT EXISTS(SELECT 1 FROM campaign_applicant_review_windows WHERE id=p_campaign) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICANT_REVIEW_CLOSED';END IF;
  IF NOT EXISTS(SELECT 1 FROM creator_campaign_eligibility WHERE creator_id=v_creator AND campaign_id=p_campaign AND identity_ready AND profile_ready AND category_ready AND platform_ready) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_INELIGIBLE';END IF;
 END IF;
 IF p_decision='APPROVE' THEN
  SELECT COUNT(*) INTO v_allocated FROM campaign_applications a WHERE campaign_id=p_campaign AND (status='APPROVED' OR EXISTS(SELECT 1 FROM campaign_creator_allocations x WHERE x.application_id=a.id));
  IF v_allocated>=v_slots THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_CAPACITY_FULL';END IF;
  INSERT INTO campaign_creator_allocations(application_id,campaign_id,creator_id,allocated_by) VALUES(p_application,p_campaign,v_creator,p_actor);
 END IF;
 SET v_target=CASE p_decision WHEN 'SHORTLIST' THEN 'SHORTLISTED' WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END;
 UPDATE campaign_applications SET status=v_target,revision=revision+1 WHERE id=p_application;
 INSERT INTO campaign_application_history(application_id,actor_user_id,from_status,to_status,reason,application_revision) VALUES(p_application,p_actor,v_status,v_target,TRIM(p_reason),v_revision+1);
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,CONCAT('APPLICATION_',v_target),'campaign_applications',p_application,p_request,JSON_OBJECT('campaignId',p_campaign,'fromStatus',v_status,'status',v_target,'revision',v_revision+1));
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_cancel_campaign_applications$$
CREATE PROCEDURE sp_cancel_campaign_applications(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 INSERT INTO campaign_application_history(application_id,actor_user_id,from_status,to_status,reason,application_revision)
 SELECT id,p_actor,status,'REJECTED','Campaign cancelled. This pending application is no longer under consideration.',revision+1 FROM campaign_applications WHERE campaign_id=p_campaign AND status IN ('PENDING','SHORTLISTED');
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata)
 SELECT p_actor,'APPLICATION_REJECTED','campaign_applications',id,p_request,JSON_OBJECT('campaignId',p_campaign,'fromStatus',status,'status','REJECTED','revision',revision+1,'cause','CAMPAIGN_CANCELLED') FROM campaign_applications WHERE campaign_id=p_campaign AND status IN ('PENDING','SHORTLISTED');
 UPDATE campaign_applications SET status='REJECTED',revision=revision+1 WHERE campaign_id=p_campaign AND status IN ('PENDING','SHORTLISTED');
END$$
DROP PROCEDURE IF EXISTS sp_change_campaign_status$$
CREATE PROCEDURE sp_change_campaign_status(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_action VARCHAR(20),IN p_revision INT,IN p_reason VARCHAR(1000),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_status VARCHAR(32);DECLARE v_revision INT;DECLARE v_target VARCHAR(32);DECLARE v_admin BOOLEAN DEFAULT FALSE;DECLARE v_open DATETIME(3);DECLARE v_deadline DATETIME(3);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SET v_admin=EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role_id=1 AND status='ACTIVE');
 IF v_admin THEN
  CALL sp_admin_assert(p_actor);
  SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id FOR UPDATE;
 ELSE
  CALL sp_brand_assert(p_actor,v_brand);
  SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id AND brand_id=v_brand FOR UPDATE;
 END IF;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>1000 OR p_action IS NULL OR p_action NOT IN ('PUBLISH','PAUSE','RESUME','CANCEL') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_LIFECYCLE_INVALID';END IF;
 IF v_admin AND p_action<>'CANCEL' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_LIFECYCLE_FORBIDDEN';END IF;
 IF p_action='PUBLISH' THEN
  IF v_status<>'APPROVED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
  CALL sp_campaign_review_assert_ready(p_id);
  SELECT applications_open_at INTO v_open FROM campaign_schedules WHERE campaign_id=p_id;
  IF v_open>UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_OPEN';END IF;
  SET v_target='LIVE';
 ELSEIF p_action='PAUSE' THEN
  IF v_status<>'LIVE' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
  SELECT application_deadline INTO v_deadline FROM campaign_schedules WHERE campaign_id=p_id;
  IF v_deadline<=UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REFRESH_REQUIRED';END IF;
  SET v_target='PAUSED';
 ELSEIF p_action='RESUME' THEN
  IF v_status<>'PAUSED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
  CALL sp_campaign_review_assert_ready(p_id);
  SET v_target='LIVE';
 ELSE
  IF v_status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','LIVE','PAUSED','APPLICATION_CLOSED','IN_PROGRESS') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_STATE';END IF;
  SET v_target='CANCELLED';
 END IF;
 CALL sp_campaign_lifecycle_record(p_actor,p_id,p_action,v_status,v_target,p_reason,p_request);
 IF p_action='CANCEL' THEN CALL sp_cancel_campaign_applications(p_actor,p_id,p_request);END IF;
 COMMIT;
END$$
DELIMITER ;
