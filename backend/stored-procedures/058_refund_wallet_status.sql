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
 (SELECT COUNT(*) FROM payment_review_cases x JOIN campaign_funding f ON f.id=x.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id WHERE x.status='OPEN' AND (b.user_id=p_actor OR EXISTS(SELECT 1 FROM campaign_creator_allocations a JOIN creators cr ON cr.id=a.creator_id WHERE a.campaign_id=c.id AND cr.user_id=p_actor))) AS openPaymentReviews,COUNT(*) AS transactionCount
 FROM wallet_entries e JOIN wallet_journals j ON j.id=e.journal_id AND j.status='POSTED' JOIN wallet_accounts a ON a.id=e.account_id
 WHERE a.owner_user_id=p_actor AND a.currency='INR' AND a.mode='TEST' AND a.account_type=IF(p_role='BRAND_ADMIN','BRAND_HELD','CREATOR_EARNINGS');
 COMMIT;
 END;
END$$
DELIMITER ;
