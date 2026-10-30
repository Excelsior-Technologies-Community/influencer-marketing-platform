-- Shared lock order matches content review, allocation and lifecycle writes.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_resubmit_content$$
CREATE PROCEDURE sp_resubmit_content(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT,IN p_url VARCHAR(2048),IN p_caption TEXT,IN p_published DATETIME(3),IN p_notes TEXT,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_current INT;DECLARE v_status VARCHAR(24);DECLARE v_campaign VARCHAR(32);DECLARE v_start DATETIME(3);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_content_owner(p_actor,p_campaign,p_submission);
 SELECT status INTO v_campaign FROM campaigns WHERE id=p_campaign FOR UPDATE;
 SELECT version,status INTO v_current,v_status FROM content_submissions WHERE id=p_submission FOR UPDATE;
 IF p_version IS NULL OR p_version<>v_current THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_CONFLICT';END IF;
 IF v_status<>'REVISION_REQUESTED' OR NOT EXISTS(SELECT 1 FROM content_submission_reviews WHERE submission_id=p_submission AND content_version=v_current AND decision='REQUEST_REVISION') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_RESUBMIT_STATE';END IF;
 IF v_current>=50 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_VERSION_LIMIT';END IF;
 IF NOT EXISTS(SELECT 1 FROM content_submission_windows WHERE id=p_campaign) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_WINDOW_CLOSED';END IF;
 SELECT start_at INTO v_start FROM content_submission_windows WHERE id=p_campaign;
 IF p_url IS NULL OR CHAR_LENGTH(p_url)<10 OR CHAR_LENGTH(p_url)>2048 OR p_url NOT LIKE 'https://%' OR p_caption IS NULL OR CHAR_LENGTH(TRIM(p_caption))<1 OR CHAR_LENGTH(p_caption)>5000 OR p_notes IS NULL OR CHAR_LENGTH(p_notes)>2000 OR p_published IS NULL OR p_published<v_start OR p_published>UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_INVALID';END IF;
 UPDATE content_submissions SET content_url=p_url,caption=TRIM(p_caption),published_at=p_published,notes=TRIM(p_notes),version=version+1,status='SUBMITTED' WHERE id=p_submission;
 CALL sp_content_snapshot(p_actor,p_submission,'RESUBMIT',p_reason);
 INSERT INTO content_version_evidence(submission_id,version,evidence_id) SELECT submission_id,v_current+1,evidence_id FROM content_version_evidence WHERE submission_id=p_submission AND version=v_current;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CONTENT_RESUBMITTED','content_submissions',p_submission,p_request,JSON_OBJECT('campaignId',p_campaign,'version',v_current+1,'previousVersion',v_current));
 COMMIT;
END$$

-- Only exact latest-version approvals for allocated, approved participants count.
CREATE OR REPLACE VIEW campaign_content_progress AS
SELECT c.id,c.status,c.revision,c.creator_slots AS creatorSlots,
 (SELECT COUNT(*) FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id WHERE x.campaign_id=c.id AND a.status='APPROVED') AS allocatedSlots,
 (SELECT COALESCE(SUM(d.quantity),0) FROM campaign_deliverables d WHERE d.campaign_id=c.id) AS itemsPerCreator,
 (SELECT COUNT(*) FROM content_submissions cs JOIN campaign_deliverables d ON d.campaign_id=cs.campaign_id AND d.platform_id=cs.platform_id AND d.content_type_id=cs.content_type_id JOIN campaign_creator_allocations x ON x.application_id=cs.application_id AND x.campaign_id=c.id JOIN campaign_applications a ON a.id=x.application_id AND a.status='APPROVED'
 WHERE cs.campaign_id=c.id AND cs.unit_number BETWEEN 1 AND d.quantity AND cs.status='APPROVED' AND EXISTS(SELECT 1 FROM content_submission_reviews r WHERE r.submission_id=cs.id AND r.content_version=cs.version AND r.decision='APPROVE')) AS approvedItems
FROM campaigns c$$
DROP PROCEDURE IF EXISTS sp_content_progress$$
CREATE PROCEDURE sp_content_progress(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_assert(p_actor,p_role,p_campaign);
 IF p_role='BRAND_ADMIN' THEN
 SELECT status,revision,creatorSlots,allocatedSlots,itemsPerCreator,creatorSlots*itemsPerCreator AS requiredItems,approvedItems,
 (status='IN_PROGRESS' AND allocatedSlots=creatorSlots AND itemsPerCreator>0 AND approvedItems=creatorSlots*itemsPerCreator) AS canComplete FROM campaign_content_progress WHERE id=p_campaign;
 ELSE
 SELECT c.status,c.revision,COALESCE(SUM(d.quantity),0) AS requiredItems,
 (SELECT COUNT(*) FROM content_submissions cs JOIN campaign_creator_allocations x ON x.application_id=cs.application_id JOIN creators cr ON cr.id=x.creator_id JOIN campaign_applications a ON a.id=x.application_id AND a.status='APPROVED' JOIN campaign_deliverables cd ON cd.campaign_id=cs.campaign_id AND cd.platform_id=cs.platform_id AND cd.content_type_id=cs.content_type_id WHERE cs.campaign_id=p_campaign AND cr.user_id=p_actor AND cs.unit_number BETWEEN 1 AND cd.quantity AND cs.status='APPROVED' AND EXISTS(SELECT 1 FROM content_submission_reviews r WHERE r.submission_id=cs.id AND r.content_version=cs.version AND r.decision='APPROVE')) AS approvedItems, FALSE AS canComplete
 FROM campaigns c LEFT JOIN campaign_deliverables d ON d.campaign_id=c.id WHERE c.id=p_campaign GROUP BY c.id;
 END IF;
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_complete_content_campaign$$
CREATE PROCEDURE sp_complete_content_campaign(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_revision INT,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard INT;DECLARE v_brand CHAR(36);DECLARE v_status VARCHAR(32);DECLARE v_revision INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 CALL sp_brand_assert(p_actor,v_brand);
 SELECT status,revision INTO v_status,v_revision FROM campaigns WHERE id=p_campaign AND brand_id=v_brand FOR UPDATE;
 IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CONFLICT';END IF;
 IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason))<10 OR CHAR_LENGTH(p_reason)>500 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_CHANGE_INVALID';END IF;
 IF v_status<>'IN_PROGRESS' OR NOT EXISTS(SELECT 1 FROM campaign_content_progress WHERE id=p_campaign AND allocatedSlots=creatorSlots AND itemsPerCreator>0 AND approvedItems=creatorSlots*itemsPerCreator) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_COMPLETION_BLOCKED';END IF;
 CALL sp_campaign_lifecycle_record(p_actor,p_campaign,'COMPLETE','IN_PROGRESS','COMPLETED',TRIM(p_reason),p_request);
 COMMIT;
END$$
DELIMITER ;
