-- Read snapshots use a non-locking actor guard; write procedures retain the shared lock order.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_funding_read$$
CREATE PROCEDURE sp_funding_read(IN p_actor CHAR(36),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_brand CHAR(36);
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_workspace_actor(p_actor,'BRAND_ADMIN');
 SELECT id INTO v_brand FROM brands WHERE user_id=p_actor;
 IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_campaign AND brand_id=v_brand) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 SELECT id,title,status,revision,total_budget AS totalBudget,currency FROM campaigns WHERE id=p_campaign;
 SELECT id,amount_minor AS amountMinor,currency,provider_key_id AS keyId,provider_order_id AS orderId,status,captured_payment_id AS paymentId,created_at AS createdAt FROM campaign_funding WHERE campaign_id=p_campaign;
 SELECT a.provider_payment_id AS paymentId,a.status,a.amount_minor AS amountMinor,a.currency,a.updated_at AS updatedAt FROM campaign_payment_attempts a JOIN campaign_funding f ON f.id=a.funding_id WHERE f.campaign_id=p_campaign ORDER BY a.updated_at DESC,a.provider_payment_id LIMIT 100;
 COMMIT;
 END;
END$$
DELIMITER ;
