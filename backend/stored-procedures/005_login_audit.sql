DELIMITER $$
DROP PROCEDURE IF EXISTS sp_create_session$$
CREATE PROCEDURE sp_create_session(IN p_id CHAR(36), IN p_user CHAR(36), IN p_hash CHAR(64), IN p_family CHAR(36), IN p_expires DATETIME(6), IN p_version INT)
SQL SECURITY INVOKER
BEGIN
  DECLARE v_version INT;
  DECLARE v_status VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT auth_version,status INTO v_version,v_status FROM users WHERE id=p_user FOR UPDATE;
  IF v_status <> 'ACTIVE' OR v_version <> p_version THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_SESSION'; END IF;
  INSERT INTO refresh_sessions(id,user_id,token_hash,family_id,expires_at,auth_version) VALUES(p_id,p_user,p_hash,p_family,p_expires,p_version);
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(p_user,'LOGIN','session',p_id);
  COMMIT;
  SELECT p_id AS id;
END$$
DELIMITER ;
