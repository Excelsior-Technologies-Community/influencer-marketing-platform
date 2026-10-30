DELIMITER $$
DROP PROCEDURE IF EXISTS sp_get_admin_role_dashboard$$
CREATE PROCEDURE sp_get_admin_role_dashboard(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_admin CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  SELECT u.id INTO v_admin
  FROM users u JOIN roles r ON r.id=u.role_id
  WHERE u.id=p_actor AND r.code='SUPER_ADMIN' AND u.status='ACTIVE';
  IF v_admin IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_FORBIDDEN'; END IF;
  SELECT
    (SELECT COUNT(*) FROM brands) AS totalBrands,
    (SELECT COUNT(*) FROM creators) AS totalCreators,
    (SELECT COUNT(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code IN ('BRAND_ADMIN','CREATOR') AND u.status='ACTIVE') AS activeAccounts,
    (SELECT COUNT(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code IN ('BRAND_ADMIN','CREATOR') AND u.status='SUSPENDED') AS suspendedAccounts,
    (SELECT COUNT(*) FROM creators WHERE verification_status IN ('PENDING','UNDER_REVIEW')) AS pendingVerification,
    (SELECT COUNT(*) FROM creators WHERE verification_status='VERIFIED') AS verifiedCreators,
    (SELECT COUNT(*) FROM categories WHERE is_active=TRUE) AS activeCategories,
    (SELECT COUNT(*) FROM platforms WHERE is_active=TRUE) AS activePlatforms,
    (SELECT COUNT(*) FROM content_types WHERE is_active=TRUE) AS activeContentTypes,
    (SELECT COUNT(*) FROM campaigns) AS totalCampaigns,
    (SELECT COUNT(*) FROM campaigns WHERE status='LIVE') AS liveCampaigns,
    (SELECT COUNT(*) FROM campaigns WHERE status='PENDING_APPROVAL') AS campaignsAwaitingReview,
    (SELECT COUNT(*) FROM campaigns WHERE status IN ('APPLICATION_CLOSED','IN_PROGRESS','CONTENT_SUBMITTED','UNDER_REVIEW')) AS activeCampaigns,
    (SELECT COUNT(*) FROM campaigns WHERE status='COMPLETED') AS completedCampaigns;
  WITH RECURSIVE months AS (
    SELECT DATE_SUB(CAST(DATE_FORMAT(UTC_DATE(),'%Y-%m-01') AS DATE),INTERVAL 5 MONTH) AS month
    UNION ALL SELECT DATE_ADD(month,INTERVAL 1 MONTH) FROM months WHERE month<CAST(DATE_FORMAT(UTC_DATE(),'%Y-%m-01') AS DATE)
  )
  SELECT DATE_FORMAT(m.month,'%Y-%m') AS month,
    SUM(CASE WHEN r.code='BRAND_ADMIN' THEN 1 ELSE 0 END) AS brands,
    SUM(CASE WHEN r.code='CREATOR' THEN 1 ELSE 0 END) AS creators
  FROM months m LEFT JOIN users u ON u.created_at>=m.month AND u.created_at<DATE_ADD(m.month,INTERVAL 1 MONTH)
    LEFT JOIN roles r ON r.id=u.role_id AND r.code IN ('BRAND_ADMIN','CREATOR')
  GROUP BY m.month ORDER BY m.month;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_get_brand_role_dashboard$$
CREATE PROCEDURE sp_get_brand_role_dashboard(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_brand CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  SELECT b.id INTO v_brand
  FROM brands b JOIN users u ON u.id=b.user_id JOIN roles r ON r.id=u.role_id
  WHERE u.id=p_actor AND r.code='BRAND_ADMIN' AND u.status='ACTIVE';
  IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN'; END IF;
  SELECT
    COUNT(*) AS totalCampaigns,
    COALESCE(SUM(c.status='DRAFT'),0) AS draftCampaigns,
    COALESCE(SUM(c.status='PENDING_APPROVAL'),0) AS campaignsAwaitingReview,
    COALESCE(SUM(c.status='LIVE'),0) AS liveCampaigns,
    COALESCE(SUM(c.status IN ('APPLICATION_CLOSED','IN_PROGRESS','CONTENT_SUBMITTED','UNDER_REVIEW')),0) AS activeCampaigns,
    COALESCE(SUM(c.status='COMPLETED'),0) AS completedCampaigns,
    (SELECT COUNT(*) FROM campaign_applications a JOIN campaigns own ON own.id=a.campaign_id
      WHERE own.brand_id=v_brand AND a.status IN ('PENDING','SHORTLISTED')) AS applicationsAwaitingDecision,
    (SELECT COUNT(DISTINCT x.creator_id) FROM campaign_creator_allocations x
      JOIN campaigns own ON own.id=x.campaign_id JOIN campaign_applications a ON a.id=x.application_id
      WHERE own.brand_id=v_brand AND a.status='APPROVED') AS approvedCreators
  FROM campaigns c WHERE c.brand_id=v_brand;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_get_creator_role_dashboard$$
CREATE PROCEDURE sp_get_creator_role_dashboard(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_creator CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  SELECT c.id INTO v_creator
  FROM creators c JOIN users u ON u.id=c.user_id JOIN roles r ON r.id=u.role_id
  WHERE u.id=p_actor AND r.code='CREATOR' AND u.status='ACTIVE';
  IF v_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  SELECT
    COUNT(DISTINCT a.id) AS totalApplications,
    COALESCE(SUM(a.status IN ('PENDING','SHORTLISTED')),0) AS applicationsAwaitingDecision,
    COALESCE(SUM(a.status='APPROVED'),0) AS approvedCollaborations,
    COALESCE(SUM(a.status='APPROVED' AND c.status IN ('LIVE','APPLICATION_CLOSED','IN_PROGRESS','CONTENT_SUBMITTED','UNDER_REVIEW')),0) AS activeCollaborations,
    COALESCE(SUM(a.status='APPROVED' AND c.status='COMPLETED'),0) AS completedCollaborations
  FROM campaign_applications a JOIN campaigns c ON c.id=a.campaign_id
  WHERE a.creator_id=v_creator;
  COMMIT;
END$$
DELIMITER ;
