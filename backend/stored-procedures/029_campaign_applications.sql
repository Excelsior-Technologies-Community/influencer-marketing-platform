DELIMITER $$
DROP PROCEDURE IF EXISTS sp_creator_application_eligibility$$
CREATE PROCEDURE sp_creator_application_eligibility(IN p_actor CHAR(36),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_creator_discovery_assert(p_actor);
 IF NOT EXISTS(SELECT 1 FROM creator_discoverable_campaigns WHERE id=p_campaign) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT identity_ready AS identityReady,COALESCE(profile_ready,FALSE) AS profileReady,category_ready AS categoryReady,platform_ready AS platformReady,application_id AS applicationId,application_status AS applicationStatus FROM creator_campaign_eligibility WHERE user_id=p_actor AND campaign_id=p_campaign;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_apply_campaign$$
CREATE PROCEDURE sp_apply_campaign(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_id CHAR(36),IN p_pitch TEXT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_creator CHAR(36);DECLARE v_user CHAR(36);DECLARE v_campaign CHAR(36);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SELECT id INTO v_user FROM users WHERE id=p_actor AND role_id=3 AND status='ACTIVE' FOR UPDATE;
 IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN';END IF;
 SELECT id INTO v_creator FROM creators WHERE user_id=p_actor FOR UPDATE;
 IF v_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_NOT_FOUND';END IF;
 SELECT id INTO v_campaign FROM campaigns WHERE id=p_campaign FOR UPDATE;
 IF v_campaign IS NULL OR NOT EXISTS(SELECT 1 FROM creator_discoverable_campaigns WHERE id=p_campaign) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM campaign_applications WHERE campaign_id=p_campaign AND creator_id=v_creator) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_DUPLICATE';END IF;
 IF NOT EXISTS(SELECT 1 FROM creator_campaign_eligibility WHERE user_id=p_actor AND campaign_id=p_campaign AND identity_ready=TRUE AND profile_ready=TRUE AND category_ready=TRUE AND platform_ready=TRUE) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_INELIGIBLE';END IF;
 IF p_pitch IS NULL OR CHAR_LENGTH(TRIM(p_pitch))<20 OR CHAR_LENGTH(p_pitch)>2000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_INVALID';END IF;
 INSERT INTO campaign_applications(id,campaign_id,creator_id,pitch) VALUES(p_id,p_campaign,v_creator,TRIM(p_pitch));
 INSERT INTO campaign_application_history(application_id,actor_user_id,from_status,to_status,application_revision) VALUES(p_id,p_actor,NULL,'PENDING',1);
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'APPLICATION_SUBMITTED','campaign_applications',p_id,p_request,JSON_OBJECT('campaignId',p_campaign,'status','PENDING','revision',1));
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_withdraw_application$$
CREATE PROCEDURE sp_withdraw_application(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_revision INT,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_creator CHAR(36);DECLARE v_user CHAR(36);DECLARE v_status VARCHAR(24);DECLARE v_revision INT;DECLARE v_campaign CHAR(36);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SELECT id INTO v_user FROM users WHERE id=p_actor AND role_id=3 AND status='ACTIVE' FOR UPDATE;
 IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN';END IF;
 SELECT id INTO v_creator FROM creators WHERE user_id=p_actor FOR UPDATE;
 SELECT a.campaign_id INTO v_campaign FROM campaign_applications a WHERE a.id=p_id AND a.creator_id=v_creator;
 IF v_campaign IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_NOT_FOUND';END IF;
 SELECT id INTO v_campaign FROM campaigns WHERE id=v_campaign FOR UPDATE;
 SELECT status,revision INTO v_status,v_revision FROM campaign_applications WHERE id=p_id AND creator_id=v_creator FOR UPDATE;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_CONFLICT';END IF;
 IF v_status NOT IN ('PENDING','SHORTLISTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_WITHDRAW_DENIED';END IF;
 IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>500 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_INVALID';END IF;
 UPDATE campaign_applications SET status='WITHDRAWN',revision=revision+1 WHERE id=p_id;
 INSERT INTO campaign_application_history(application_id,actor_user_id,from_status,to_status,reason,application_revision) VALUES(p_id,p_actor,v_status,'WITHDRAWN',TRIM(p_reason),v_revision+1);
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'APPLICATION_WITHDRAWN','campaign_applications',p_id,p_request,JSON_OBJECT('campaignId',v_campaign,'fromStatus',v_status,'status','WITHDRAWN','revision',v_revision+1));
 COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_creator_application_detail$$
CREATE PROCEDURE sp_creator_application_detail(IN p_actor CHAR(36),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_creator_discovery_assert(p_actor);
 IF NOT EXISTS(SELECT 1 FROM campaign_applications a JOIN creators cr ON cr.id=a.creator_id WHERE a.id=p_id AND cr.user_id=p_actor) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='APPLICATION_NOT_FOUND';END IF;
 SELECT a.id,a.campaign_id AS campaignId,c.title AS campaignTitle,b.company_name AS companyName,c.status AS campaignStatus,a.pitch,a.status,a.revision,a.created_at AS createdAt,a.updated_at AS updatedAt FROM campaign_applications a JOIN creators cr ON cr.id=a.creator_id JOIN campaigns c ON c.id=a.campaign_id JOIN brands b ON b.id=c.brand_id WHERE a.id=p_id AND cr.user_id=p_actor;
 SELECT h.id,h.from_status AS fromStatus,h.to_status AS toStatus,h.reason,h.application_revision AS revision,h.created_at AS createdAt FROM campaign_application_history h WHERE h.application_id=p_id ORDER BY h.id;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_creator_applications$$
CREATE PROCEDURE sp_creator_applications(IN p_actor CHAR(36),IN p_status VARCHAR(24),IN p_q VARCHAR(100),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_creator_discovery_assert(p_actor);
 SELECT a.id,a.campaign_id AS campaignId,c.title AS campaignTitle,b.company_name AS companyName,c.status AS campaignStatus,a.status,a.revision,a.created_at AS createdAt,a.updated_at AS updatedAt FROM campaign_applications a JOIN creators cr ON cr.id=a.creator_id JOIN campaigns c ON c.id=a.campaign_id JOIN brands b ON b.id=c.brand_id WHERE cr.user_id=p_actor AND (p_status IS NULL OR a.status=p_status) AND (p_q='' OR LOCATE(p_q,c.title)>0 OR LOCATE(p_q,b.company_name)>0) ORDER BY a.updated_at DESC,a.id LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM campaign_applications a JOIN creators cr ON cr.id=a.creator_id JOIN campaigns c ON c.id=a.campaign_id JOIN brands b ON b.id=c.brand_id WHERE cr.user_id=p_actor AND (p_status IS NULL OR a.status=p_status) AND (p_q='' OR LOCATE(p_q,c.title)>0 OR LOCATE(p_q,b.company_name)>0);
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_delete_campaign$$
CREATE PROCEDURE sp_delete_campaign(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_revision INT;DECLARE v_status VARCHAR(32);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_assert(p_actor,v_brand);
 SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_id AND brand_id=v_brand FOR UPDATE;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM campaign_applications WHERE campaign_id=p_id) OR v_status<>'DRAFT' OR EXISTS(SELECT 1 FROM campaign_review_history WHERE campaign_id=p_id) OR EXISTS(SELECT 1 FROM campaign_lifecycle_history WHERE campaign_id=p_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_DELETE_DENIED';END IF;
 DELETE FROM campaigns WHERE id=p_id;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CAMPAIGN_DRAFT_DELETED','campaigns',p_id,p_request,JSON_OBJECT('revision',v_revision));
 COMMIT;
END$$
DELIMITER ;
