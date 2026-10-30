-- Reconcile pre-ledger captures, preserving their original captured principal.
-- The procedure remains internal, with no repository allowlist or HTTP exposure.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_wallet_backfill_funding$$
CREATE PROCEDURE sp_wallet_backfill_funding()
SQL SECURITY INVOKER
BEGIN
 DECLARE v_done BOOLEAN DEFAULT FALSE;DECLARE v_id CHAR(36);DECLARE v_guard INT;
 DECLARE captured CURSOR FOR SELECT id FROM campaign_funding WHERE status='SUCCEEDED' ORDER BY id;
 DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=TRUE;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 OPEN captured;
 capture_loop: LOOP
  FETCH captured INTO v_id;
  IF v_done THEN LEAVE capture_loop;END IF;
  START TRANSACTION;
  SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
  CALL sp_wallet_post_funding(v_id,NULL);
  COMMIT;
 END LOOP;
 CLOSE captured;
END$$
CALL sp_wallet_backfill_funding()$$
DELIMITER ;
