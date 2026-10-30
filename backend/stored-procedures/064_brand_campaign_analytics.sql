DELIMITER $$
DROP PROCEDURE IF EXISTS sp_brand_campaign_analytics$$
CREATE PROCEDURE sp_brand_campaign_analytics(IN p_actor CHAR(36),IN p_status VARCHAR(32),IN p_q VARCHAR(100),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  DECLARE v_brand CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  SELECT b.id INTO v_brand
  FROM brands b JOIN users u ON u.id=b.user_id JOIN roles r ON r.id=u.role_id
  WHERE u.id=p_actor AND r.code='BRAND_ADMIN' AND u.status='ACTIVE';
  IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BRAND_FORBIDDEN'; END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR p_offset IS NULL OR p_offset<0
    OR (p_status IS NOT NULL AND p_status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED','LIVE','APPLICATION_CLOSED','IN_PROGRESS','CONTENT_SUBMITTED','UNDER_REVIEW','COMPLETED','REJECTED','PAUSED','CANCELLED','EXPIRED'))
    OR p_q IS NULL OR CHAR_LENGTH(p_q)>100 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_ANALYTICS_INVALID_QUERY'; END IF;
  SELECT c.id,c.title,c.status,c.currency,CAST(c.total_budget AS CHAR) AS budgetAmount,
    IF(c.currency='INR' AND c.total_budget IS NOT NULL,CAST(ROUND(c.total_budget*100,0) AS CHAR),NULL) AS budgetMinor,
    c.created_at AS createdAt,c.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM campaign_applications a WHERE a.campaign_id=c.id) AS applications,
    (SELECT COUNT(DISTINCT x.creator_id) FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id AND a.status='APPROVED' WHERE x.campaign_id=c.id) AS approvedCreators,
    (SELECT COUNT(*) FROM content_submissions cs WHERE cs.campaign_id=c.id) AS submittedDeliverables,
    COALESCE((SELECT SUM(d.quantity) FROM campaign_deliverables d WHERE d.campaign_id=c.id),0)*c.creator_slots AS requiredDeliverables,
    COALESCE((SELECT p.approvedItems FROM campaign_content_progress p WHERE p.id=c.id),0) AS approvedDeliverables,
    IF(f.status='SUCCEEDED' AND EXISTS(SELECT 1 FROM wallet_journals cap WHERE cap.funding_id=f.id AND cap.event_type='FUNDING_CAPTURE' AND cap.status='POSTED'),CAST(f.amount_minor AS CHAR),NULL) AS fundedMinor,
    CAST(COALESCE((SELECT SUM(j.amount_minor) FROM wallet_journals j WHERE j.funding_id=f.id AND j.event_type='CREATOR_RELEASE' AND j.status='POSTED'),0) AS CHAR) AS releasedGrossMinor,
    CAST(COALESCE((SELECT SUM(r.net_minor) FROM creator_payment_releases r JOIN wallet_journals j ON j.id=r.journal_id AND j.status='POSTED' AND j.event_type='CREATOR_RELEASE' WHERE j.funding_id=f.id),0) AS CHAR) AS creatorPayoutMinor,
    CAST(COALESCE((SELECT SUM(r.commission_minor) FROM creator_payment_releases r JOIN wallet_journals j ON j.id=r.journal_id AND j.status='POSTED' AND j.event_type='CREATOR_RELEASE' WHERE j.funding_id=f.id),0) AS CHAR) AS commissionMinor,
    CAST(COALESCE((SELECT SUM(j.amount_minor) FROM wallet_journals j WHERE j.funding_id=f.id AND j.event_type='REFUND_PROCESSED' AND j.status='POSTED'),0) AS CHAR) AS refundedMinor,
    CAST(COALESCE((SELECT SUM(CASE WHEN e.direction='CREDIT' THEN CAST(e.amount_minor AS DECIMAL(30,0)) ELSE -CAST(e.amount_minor AS DECIMAL(30,0)) END)
      FROM wallet_entries e JOIN wallet_journals j ON j.id=e.journal_id AND j.status='POSTED' JOIN wallet_accounts wa ON wa.id=e.account_id
      WHERE j.funding_id=f.id AND wa.owner_user_id=p_actor AND wa.account_type='BRAND_HELD' AND wa.currency='INR' AND wa.mode='TEST'),0) AS CHAR) AS heldMinor,
    'NOT_RECORDED' AS performanceStatus
  FROM campaigns c LEFT JOIN campaign_funding f ON f.campaign_id=c.id
  WHERE c.brand_id=v_brand AND (p_status IS NULL OR c.status=p_status) AND (p_q='' OR LOCATE(p_q,c.title)>0)
  ORDER BY c.updated_at DESC,c.id LIMIT p_limit OFFSET p_offset;
  SELECT COUNT(*) AS total FROM campaigns c
  WHERE c.brand_id=v_brand AND (p_status IS NULL OR c.status=p_status) AND (p_q='' OR LOCATE(p_q,c.title)>0);
  COMMIT;
END$$
DELIMITER ;
