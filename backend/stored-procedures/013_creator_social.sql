DELIMITER $$
DROP PROCEDURE IF EXISTS sp_get_creator_social_accounts$$
CREATE PROCEDURE sp_get_creator_social_accounts(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users u JOIN creators c ON c.user_id=u.id WHERE u.id=p_actor AND u.role_id=3 AND u.status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  SELECT s.id,s.platform_id AS platformId,p.name AS platformName,p.code AS platformCode,p.is_active AS isAvailable,
    s.username,s.profile_url AS profileUrl,s.followers_count AS followersCount,s.average_views AS averageViews,
    s.engagement_rate AS engagementRate,'MANUAL' AS metricsSource,FALSE AS isVerified,
    s.metrics_reported_at AS metricsReportedAt,s.revision,s.created_at AS createdAt,s.updated_at AS updatedAt
  FROM creator_social_accounts s JOIN creators c ON c.id=s.creator_id JOIN platforms p ON p.id=s.platform_id
  WHERE c.user_id=p_actor ORDER BY p.name,s.id;
  SELECT p.id,p.code,p.name,p.is_active AS isAvailable FROM platforms p
  WHERE p.is_active=TRUE OR EXISTS(SELECT 1 FROM creator_social_accounts s JOIN creators c ON c.id=s.creator_id WHERE c.user_id=p_actor AND s.platform_id=p.id)
  ORDER BY p.name,p.id;
END$$
DROP PROCEDURE IF EXISTS sp_save_creator_social_account$$
CREATE PROCEDURE sp_save_creator_social_account(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_create BOOLEAN,IN p_platform INT,IN p_username VARCHAR(100),IN p_url VARCHAR(2048),IN p_followers BIGINT,IN p_views BIGINT,IN p_engagement DECIMAL(5,2),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_guard INT; DECLARE v_user CHAR(36); DECLARE v_creator CHAR(36); DECLARE v_revision INT; DECLARE v_platform INT; DECLARE v_active BOOLEAN;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
  SELECT id INTO v_user FROM users WHERE id=p_actor AND role_id=3 AND status='ACTIVE' FOR UPDATE;
  IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  SELECT id INTO v_creator FROM creators WHERE user_id=p_actor FOR UPDATE;
  IF v_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_NOT_FOUND'; END IF;
  IF p_create THEN
    IF (SELECT COUNT(*) FROM creator_social_accounts WHERE creator_id=v_creator)>=20 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_LIMIT'; END IF;
    SELECT id,is_active INTO v_platform,v_active FROM platforms WHERE id=p_platform FOR UPDATE;
    IF v_platform IS NULL OR NOT v_active THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_INVALID_PLATFORM'; END IF;
    IF EXISTS(SELECT 1 FROM creator_social_accounts WHERE creator_id=v_creator AND platform_id=p_platform) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_DUPLICATE'; END IF;
  ELSE
    SELECT revision,platform_id INTO v_revision,v_platform FROM creator_social_accounts WHERE id=p_id AND creator_id=v_creator FOR UPDATE;
    IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_NOT_FOUND'; END IF;
    IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_CONFLICT'; END IF;
    IF p_platform<>v_platform THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_INVALID_PLATFORM'; END IF;
  END IF;
  IF p_username IS NULL OR CHAR_LENGTH(TRIM(p_username))=0 OR p_url IS NULL OR p_url NOT LIKE 'https://%' OR p_followers<0 OR p_followers>1000000000000 OR p_views<0 OR p_views>1000000000000 OR p_engagement<0 OR p_engagement>100 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_INVALID_FIELDS'; END IF;
  IF p_create THEN
    INSERT INTO creator_social_accounts(id,creator_id,platform_id,username,profile_url,followers_count,average_views,engagement_rate,metrics_reported_at)
    VALUES(p_id,v_creator,v_platform,p_username,p_url,p_followers,p_views,p_engagement,IF(p_followers IS NULL AND p_views IS NULL AND p_engagement IS NULL,NULL,UTC_TIMESTAMP(6)));
  ELSE
    UPDATE creator_social_accounts SET username=p_username,profile_url=p_url,followers_count=p_followers,average_views=p_views,engagement_rate=p_engagement,
      metrics_reported_at=IF(p_followers IS NULL AND p_views IS NULL AND p_engagement IS NULL,NULL,UTC_TIMESTAMP(6)),revision=revision+1 WHERE id=p_id;
  END IF;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,IF(p_create,'CREATOR_SOCIAL_ADDED','CREATOR_SOCIAL_UPDATED'),'creator_social_accounts',p_id,p_request,JSON_OBJECT('platformId',v_platform,'revision',IF(p_create,1,v_revision+1),'metricsSource','MANUAL'));
  COMMIT;
END$$
DROP PROCEDURE IF EXISTS sp_delete_creator_social_account$$
CREATE PROCEDURE sp_delete_creator_social_account(IN p_actor CHAR(36),IN p_id CHAR(36),IN p_revision INT,IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_guard INT; DECLARE v_user CHAR(36); DECLARE v_creator CHAR(36); DECLARE v_revision INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
  SELECT id INTO v_user FROM users WHERE id=p_actor AND role_id=3 AND status='ACTIVE' FOR UPDATE;
  IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  SELECT id INTO v_creator FROM creators WHERE user_id=p_actor FOR UPDATE;
  SELECT revision INTO v_revision FROM creator_social_accounts WHERE id=p_id AND creator_id=v_creator FOR UPDATE;
  IF v_revision IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_NOT_FOUND'; END IF;
  IF p_revision IS NULL OR p_revision<>v_revision THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SOCIAL_CONFLICT'; END IF;
  DELETE FROM creator_social_accounts WHERE id=p_id AND creator_id=v_creator;
  INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CREATOR_SOCIAL_REMOVED','creator_social_accounts',p_id,p_request,JSON_OBJECT('revision',v_revision,'metricsSource','MANUAL'));
  COMMIT;
END$$
DELIMITER ;
