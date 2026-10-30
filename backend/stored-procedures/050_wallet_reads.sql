DELIMITER $$
DROP PROCEDURE IF EXISTS sp_wallet_summary$$
CREATE PROCEDURE sp_wallet_summary(IN p_actor CHAR(36),IN p_role VARCHAR(20))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_actor(p_actor,p_role);
 SELECT 'INR' AS currency,'TEST' AS mode,IF(p_role='BRAND_ADMIN','CAMPAIGN_FUNDS_HELD','CREATOR_EARNINGS') AS balanceKind,
 CAST(COALESCE(SUM(CASE WHEN e.direction='CREDIT' THEN e.amount_minor ELSE -CAST(e.amount_minor AS DECIMAL(30,0)) END),0) AS CHAR) AS balanceMinor,
 CAST(COALESCE(SUM(CASE WHEN e.direction='CREDIT' THEN e.amount_minor ELSE 0 END),0) AS CHAR) AS creditsMinor,
 CAST(COALESCE(SUM(CASE WHEN e.direction='DEBIT' THEN e.amount_minor ELSE 0 END),0) AS CHAR) AS debitsMinor,
 COUNT(*) AS transactionCount
 FROM wallet_entries e JOIN wallet_journals j ON j.id=e.journal_id AND j.status='POSTED' JOIN wallet_accounts a ON a.id=e.account_id
 WHERE a.owner_user_id=p_actor AND a.currency='INR' AND a.mode='TEST' AND a.account_type=IF(p_role='BRAND_ADMIN','BRAND_HELD','CREATOR_EARNINGS');
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_wallet_transactions$$
CREATE PROCEDURE sp_wallet_transactions(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_direction VARCHAR(6),IN p_from DATETIME(3),IN p_to DATETIME(3),IN p_campaign CHAR(36),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_actor(p_actor,p_role);
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR p_offset IS NULL OR p_offset<0 OR (p_direction IS NOT NULL AND p_direction NOT IN ('CREDIT','DEBIT')) OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>=p_to) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_QUERY';END IF;
 SELECT CAST(e.id AS CHAR) AS id,j.id AS journalId,j.event_type AS eventType,e.direction,CAST(e.amount_minor AS CHAR) AS amountMinor,j.currency,j.mode,j.posted_at AS postedAt,c.id AS campaignId,c.title AS campaignTitle
 FROM wallet_entries e JOIN wallet_journals j ON j.id=e.journal_id AND j.status='POSTED' JOIN wallet_accounts a ON a.id=e.account_id JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id
 WHERE a.owner_user_id=p_actor AND a.currency='INR' AND a.mode='TEST' AND a.account_type=IF(p_role='BRAND_ADMIN','BRAND_HELD','CREATOR_EARNINGS')
 AND (p_direction IS NULL OR e.direction=p_direction) AND (p_from IS NULL OR j.posted_at>=p_from) AND (p_to IS NULL OR j.posted_at<p_to) AND (p_campaign IS NULL OR c.id=p_campaign)
 ORDER BY j.posted_at DESC,j.id DESC,e.id DESC LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM wallet_entries e JOIN wallet_journals j ON j.id=e.journal_id AND j.status='POSTED' JOIN wallet_accounts a ON a.id=e.account_id JOIN campaign_funding f ON f.id=j.funding_id
 WHERE a.owner_user_id=p_actor AND a.currency='INR' AND a.mode='TEST' AND a.account_type=IF(p_role='BRAND_ADMIN','BRAND_HELD','CREATOR_EARNINGS')
 AND (p_direction IS NULL OR e.direction=p_direction) AND (p_from IS NULL OR j.posted_at>=p_from) AND (p_to IS NULL OR j.posted_at<p_to) AND (p_campaign IS NULL OR f.campaign_id=p_campaign);
 COMMIT;
 END;
END$$
DROP PROCEDURE IF EXISTS sp_wallet_payment_history$$
CREATE PROCEDURE sp_wallet_payment_history(IN p_actor CHAR(36),IN p_status VARCHAR(24),IN p_from DATETIME(3),IN p_to DATETIME(3),IN p_campaign CHAR(36),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_actor(p_actor,'BRAND_ADMIN');
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR p_offset IS NULL OR p_offset<0 OR (p_status IS NOT NULL AND p_status NOT IN ('AUTHORIZED','CAPTURED','FAILED')) OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>=p_to) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_QUERY';END IF;
 SELECT p.provider_payment_id AS id,p.status,CAST(p.amount_minor AS CHAR) AS amountMinor,p.currency,'TEST' AS mode,p.updated_at AS updatedAt,c.id AS campaignId,c.title AS campaignTitle
 FROM campaign_payment_attempts p JOIN campaign_funding f ON f.id=p.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id
 WHERE b.user_id=p_actor AND (p_status IS NULL OR p.status=p_status) AND (p_from IS NULL OR p.updated_at>=p_from) AND (p_to IS NULL OR p.updated_at<p_to) AND (p_campaign IS NULL OR c.id=p_campaign)
 ORDER BY p.updated_at DESC,p.provider_payment_id DESC LIMIT p_limit OFFSET p_offset;
 SELECT COUNT(*) AS total FROM campaign_payment_attempts p JOIN campaign_funding f ON f.id=p.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id
 WHERE b.user_id=p_actor AND (p_status IS NULL OR p.status=p_status) AND (p_from IS NULL OR p.updated_at>=p_from) AND (p_to IS NULL OR p.updated_at<p_to) AND (p_campaign IS NULL OR c.id=p_campaign);
 COMMIT;
 END;
END$$
DELIMITER ;
