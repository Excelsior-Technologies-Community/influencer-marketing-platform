DELIMITER $$
DROP PROCEDURE IF EXISTS sp_create_user$$
CREATE PROCEDURE sp_create_user(IN p_id CHAR(36), IN p_role VARCHAR(32), IN p_name VARCHAR(120), IN p_email VARCHAR(254), IN p_hash VARCHAR(255), IN p_company VARCHAR(160))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_role TINYINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_role FROM roles WHERE code=p_role;
  IF v_role IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_ROLE'; END IF;
  INSERT INTO users(id,role_id,name,email,password_hash) VALUES(p_id,v_role,p_name,p_email,p_hash);
  IF p_role='BRAND_ADMIN' THEN INSERT INTO brands(id,user_id,company_name) VALUES(UUID(),p_id,p_company); END IF;
  IF p_role='CREATOR' THEN INSERT INTO creators(id,user_id) VALUES(UUID(),p_id); END IF;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(p_id,'ACCOUNT_CREATED','user',p_id);
  COMMIT;
  SELECT p_id AS id;
END$$
DROP PROCEDURE IF EXISTS sp_user_login$$
CREATE PROCEDURE sp_user_login(IN p_email VARCHAR(254))
SQL SECURITY INVOKER
BEGIN
  SELECT u.id,u.name,u.email,u.password_hash,u.status,u.auth_version,r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=p_email;
END$$
DROP PROCEDURE IF EXISTS sp_get_user_by_id$$
CREATE PROCEDURE sp_get_user_by_id(IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
  SELECT u.id,u.name,u.email,u.status,u.auth_version,r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=p_id;
END$$
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
  COMMIT;
  SELECT p_id AS id;
END$$
DROP PROCEDURE IF EXISTS sp_get_session$$
CREATE PROCEDURE sp_get_session(IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
  SELECT s.id,s.user_id,s.token_hash,s.family_id,s.expires_at,s.revoked_at,s.auth_version,u.status,u.auth_version AS current_version FROM refresh_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=p_id;
END$$
DROP PROCEDURE IF EXISTS sp_rotate_session$$
CREATE PROCEDURE sp_rotate_session(IN p_old CHAR(36), IN p_hash CHAR(64), IN p_new CHAR(36), IN p_newhash CHAR(64), IN p_expires DATETIME(6))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_user CHAR(36);
  DECLARE v_family CHAR(36);
  DECLARE v_hash CHAR(64);
  DECLARE v_revoked DATETIME(6);
  DECLARE v_expires DATETIME(6);
  DECLARE v_version INT;
  DECLARE v_current INT;
  DECLARE v_status VARCHAR(16);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT user_id INTO v_user FROM refresh_sessions WHERE id=p_old;
  SELECT auth_version,status INTO v_current,v_status FROM users WHERE id=v_user FOR UPDATE;
  SELECT family_id,token_hash,revoked_at,expires_at,auth_version INTO v_family,v_hash,v_revoked,v_expires,v_version FROM refresh_sessions WHERE id=p_old FOR UPDATE;
  IF v_user IS NULL OR v_hash <> p_hash THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_SESSION'; END IF;
  IF v_revoked IS NOT NULL THEN
    UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(6)) WHERE family_id=v_family;
    INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(v_user,'REFRESH_REPLAY_BLOCKED','session',p_old);
    COMMIT;
    SELECT 'REPLAY' AS result;
  ELSE
    IF v_expires <= UTC_TIMESTAMP(6) OR v_status <> 'ACTIVE' OR v_version <> v_current THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_SESSION'; END IF;
    UPDATE refresh_sessions SET revoked_at=UTC_TIMESTAMP(6) WHERE id=p_old;
    INSERT INTO refresh_sessions(id,user_id,token_hash,family_id,expires_at,auth_version) VALUES(p_new,v_user,p_newhash,v_family,p_expires,v_version);
    COMMIT;
    SELECT 'OK' AS result;
  END IF;
END$$
DROP PROCEDURE IF EXISTS sp_revoke_session$$
CREATE PROCEDURE sp_revoke_session(IN p_id CHAR(36), IN p_hash CHAR(64))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_user CHAR(36);
  DECLARE v_family CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT user_id,family_id INTO v_user,v_family FROM refresh_sessions WHERE id=p_id AND token_hash=p_hash;
  IF v_user IS NOT NULL THEN
    SELECT id INTO v_user FROM users WHERE id=v_user FOR UPDATE;
    UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(6)) WHERE family_id=v_family;
    INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(v_user,'LOGOUT','session',p_id);
  END IF;
  COMMIT;
  SELECT 'OK' AS result;
END$$
DROP PROCEDURE IF EXISTS sp_issue_reset$$
CREATE PROCEDURE sp_issue_reset(IN p_id CHAR(36), IN p_user CHAR(36), IN p_hash CHAR(64), IN p_expires DATETIME(6))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_user CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_user FROM users WHERE id=p_user AND status='ACTIVE' FOR UPDATE;
  IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_SESSION'; END IF;
  UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP(6) WHERE user_id=p_user AND used_at IS NULL;
  INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES(p_id,p_user,p_hash,p_expires);
  COMMIT;
  SELECT p_id AS id;
END$$
DROP PROCEDURE IF EXISTS sp_change_password$$
CREATE PROCEDURE sp_change_password(IN p_token CHAR(64), IN p_password VARCHAR(255))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_user CHAR(36);
  DECLARE v_token CHAR(36);
  DECLARE v_lock CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT user_id INTO v_user FROM password_reset_tokens WHERE token_hash=p_token;
  SELECT id INTO v_lock FROM users WHERE id=v_user AND status='ACTIVE' FOR UPDATE;
  SELECT id INTO v_token FROM password_reset_tokens WHERE token_hash=p_token AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE;
  IF v_token IS NULL OR v_lock IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_RESET'; END IF;
  UPDATE users SET password_hash=p_password,auth_version=auth_version+1 WHERE id=v_user;
  UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP(6) WHERE user_id=v_user AND used_at IS NULL;
  UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(6)) WHERE user_id=v_user;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(v_user,'PASSWORD_RESET','user',v_user);
  COMMIT;
  SELECT 'OK' AS result;
END$$
DELIMITER ;
