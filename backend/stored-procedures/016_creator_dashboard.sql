DELIMITER $$
DROP PROCEDURE IF EXISTS sp_get_creator_dashboard$$
CREATE PROCEDURE sp_get_creator_dashboard(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  IF NOT EXISTS(SELECT 1 FROM users u JOIN creators c ON c.user_id=u.id WHERE u.id=p_actor AND u.role_id=3 AND u.status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  CALL sp_get_creator(p_actor);
  SELECT s.id,s.platform_id AS platformId,p.name AS platformName,p.code AS platformCode,p.is_active AS isAvailable,
    s.username,s.profile_url AS profileUrl,s.followers_count AS followersCount,s.average_views AS averageViews,
    s.engagement_rate AS engagementRate,'MANUAL' AS metricsSource,FALSE AS isVerified,
    s.metrics_reported_at AS metricsReportedAt,s.revision,s.created_at AS createdAt,s.updated_at AS updatedAt
  FROM creator_social_accounts s JOIN creators c ON c.id=s.creator_id JOIN platforms p ON p.id=s.platform_id
  WHERE c.user_id=p_actor ORDER BY p.name,s.id;
  SELECT a.id,a.kind,a.title,a.mime_type AS mimeType,a.byte_size AS byteSize,a.width,a.height,a.page_count AS pageCount,
    a.revision,a.created_at AS createdAt,a.updated_at AS updatedAt
  FROM creator_assets a JOIN creators c ON c.id=a.creator_id WHERE c.user_id=p_actor ORDER BY a.kind,a.created_at,a.id;
  SELECT (SELECT COUNT(*) FROM categories cat LEFT JOIN categories parent ON parent.id=cat.parent_id WHERE cat.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE)) AS availableCategoryCount,
    (SELECT COUNT(*) FROM platforms WHERE is_active=TRUE) AS availablePlatformCount;
  COMMIT;
END$$
DELIMITER ;
