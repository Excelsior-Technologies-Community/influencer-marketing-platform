DELIMITER $$
DROP PROCEDURE IF EXISTS sp_analytics_report$$
CREATE PROCEDURE sp_analytics_report(
 IN p_actor CHAR(36), IN p_role VARCHAR(24), IN p_from DATE, IN p_to DATE,
 IN p_status VARCHAR(32), IN p_campaign CHAR(36), IN p_q VARCHAR(100),
 IN p_limit INT, IN p_offset INT
)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_role VARCHAR(24);
 DECLARE v_brand CHAR(36) DEFAULT NULL;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 SELECT r.code INTO v_role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=p_actor AND u.status='ACTIVE';
 IF v_role IS NULL OR v_role<>p_role OR v_role NOT IN ('SUPER_ADMIN','BRAND_ADMIN','CREATOR') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REPORT_FORBIDDEN'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>5001 OR p_offset IS NULL OR p_offset<0 OR p_offset>500000
   OR p_q IS NULL OR CHAR_LENGTH(p_q)>100 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to)
   OR (p_from IS NOT NULL AND p_to IS NOT NULL AND DATEDIFF(p_to,p_from)>366)
   OR (p_status IS NOT NULL AND p_status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED','LIVE','APPLICATION_CLOSED','IN_PROGRESS','CONTENT_SUBMITTED','UNDER_REVIEW','COMPLETED','REJECTED','PAUSED','CANCELLED','EXPIRED'))
 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REPORT_INVALID_QUERY'; END IF;
 IF v_role='BRAND_ADMIN' THEN
  SELECT b.id INTO v_brand FROM brands b WHERE b.user_id=p_actor;
  IF v_brand IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REPORT_FORBIDDEN'; END IF;
 END IF;
 WITH report_rows AS (
  SELECT CONCAT(j.id,':') AS rowId,j.posted_at AS reportDate,'FUNDING_CAPTURE' AS eventType,c.id AS campaignId,c.title AS campaignTitle,c.status AS campaignStatus,CAST(NULL AS CHAR(160)) AS creatorName,'INR' AS currency,'TEST' AS mode,CAST(j.amount_minor AS DECIMAL(30,0)) AS grossMinor,CAST(0 AS DECIMAL(30,0)) AS commissionMinor,CAST(0 AS DECIMAL(30,0)) AS netMinor,CAST(0 AS DECIMAL(30,0)) AS refundedMinor,c.brand_id AS brandId,CAST(NULL AS CHAR(36)) AS creatorUserId
  FROM wallet_journals j JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id
  WHERE j.event_type='FUNDING_CAPTURE' AND j.status='POSTED'
  UNION ALL
  SELECT CONCAT(j.id,':',r.user_id),j.posted_at,'CREATOR_RELEASE',c.id,c.title,c.status,u.name,'INR','TEST',CAST(r.gross_minor AS DECIMAL(30,0)),CAST(r.commission_minor AS DECIMAL(30,0)),CAST(r.net_minor AS DECIMAL(30,0)),CAST(0 AS DECIMAL(30,0)),c.brand_id,r.user_id
  FROM wallet_journals j JOIN creator_payment_releases r ON r.journal_id=j.id JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN users u ON u.id=r.user_id
  WHERE j.event_type='CREATOR_RELEASE' AND j.status='POSTED'
  UNION ALL
  SELECT CONCAT(j.id,':'),j.posted_at,'REFUND_PROCESSED',c.id,c.title,c.status,CAST(NULL AS CHAR(160)),'INR','TEST',CAST(0 AS DECIMAL(30,0)),CAST(0 AS DECIMAL(30,0)),CAST(0 AS DECIMAL(30,0)),CAST(j.amount_minor AS DECIMAL(30,0)),c.brand_id,CAST(NULL AS CHAR(36))
  FROM wallet_journals j JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id
  WHERE j.event_type='REFUND_PROCESSED' AND j.status='POSTED'
 )
 SELECT rowId,reportDate,eventType,campaignId,campaignTitle,campaignStatus,creatorName,currency,mode,
   CAST(grossMinor AS CHAR) AS grossMinor,CAST(commissionMinor AS CHAR) AS commissionMinor,CAST(netMinor AS CHAR) AS netMinor,CAST(refundedMinor AS CHAR) AS refundedMinor
 FROM report_rows
 WHERE (p_role='SUPER_ADMIN' OR (p_role='BRAND_ADMIN' AND brandId=v_brand) OR (p_role='CREATOR' AND eventType='CREATOR_RELEASE' AND creatorUserId=p_actor))
  AND (p_from IS NULL OR reportDate>=p_from) AND (p_to IS NULL OR reportDate<DATE_ADD(p_to,INTERVAL 1 DAY))
  AND (p_status IS NULL OR campaignStatus=p_status) AND (p_campaign IS NULL OR campaignId=p_campaign)
  AND (p_q='' OR LOCATE(p_q,campaignTitle)>0 OR LOCATE(p_q,COALESCE(creatorName,''))>0)
 ORDER BY reportDate DESC,rowId LIMIT p_limit OFFSET p_offset;
 WITH report_rows AS (
  SELECT j.posted_at AS reportDate,'FUNDING_CAPTURE' AS eventType,c.id AS campaignId,c.title AS campaignTitle,c.status AS campaignStatus,CAST(NULL AS CHAR(160)) AS creatorName,c.brand_id AS brandId,CAST(NULL AS CHAR(36)) AS creatorUserId
  FROM wallet_journals j JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id WHERE j.event_type='FUNDING_CAPTURE' AND j.status='POSTED'
  UNION ALL
  SELECT j.posted_at,'CREATOR_RELEASE',c.id,c.title,c.status,u.name,c.brand_id,r.user_id
  FROM wallet_journals j JOIN creator_payment_releases r ON r.journal_id=j.id JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN users u ON u.id=r.user_id WHERE j.event_type='CREATOR_RELEASE' AND j.status='POSTED'
  UNION ALL
  SELECT j.posted_at,'REFUND_PROCESSED',c.id,c.title,c.status,CAST(NULL AS CHAR(160)),c.brand_id,CAST(NULL AS CHAR(36))
  FROM wallet_journals j JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id WHERE j.event_type='REFUND_PROCESSED' AND j.status='POSTED'
 )
 SELECT COUNT(*) AS total FROM report_rows
 WHERE (p_role='SUPER_ADMIN' OR (p_role='BRAND_ADMIN' AND brandId=v_brand) OR (p_role='CREATOR' AND eventType='CREATOR_RELEASE' AND creatorUserId=p_actor))
  AND (p_from IS NULL OR reportDate>=p_from) AND (p_to IS NULL OR reportDate<DATE_ADD(p_to,INTERVAL 1 DAY))
  AND (p_status IS NULL OR campaignStatus=p_status) AND (p_campaign IS NULL OR campaignId=p_campaign)
  AND (p_q='' OR LOCATE(p_q,campaignTitle)>0 OR LOCATE(p_q,COALESCE(creatorName,''))>0);
 COMMIT;
END$$
DELIMITER ;
