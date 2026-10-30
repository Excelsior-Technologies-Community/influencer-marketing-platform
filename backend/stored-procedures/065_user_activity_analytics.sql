DELIMITER $$
DROP PROCEDURE IF EXISTS sp_track_analytics_event$$
CREATE PROCEDURE sp_track_analytics_event(IN p_actor CHAR(36),IN p_event CHAR(36),IN p_session CHAR(36),IN p_screen VARCHAR(255),IN p_duration INT UNSIGNED)
SQL SECURITY INVOKER
BEGIN
  DECLARE v_user CHAR(36);
  DECLARE v_end DATETIME(3);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_user FROM users WHERE id=p_actor AND status='ACTIVE';
  IF v_user IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ANALYTICS_FORBIDDEN'; END IF;
  IF p_event IS NULL OR p_session IS NULL OR p_screen IS NULL OR CHAR_LENGTH(p_screen)<1 OR CHAR_LENGTH(p_screen)>255
    OR p_screen NOT REGEXP '^/[A-Za-z0-9/_:-]*$' OR p_duration IS NULL OR p_duration>1800000 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ANALYTICS_INVALID_EVENT';
  END IF;
  SET v_end=UTC_TIMESTAMP(3);
  INSERT INTO analytics_events(event_id,user_id,session_id,screen,start_time,end_time,duration_ms)
    VALUES(p_event,p_actor,p_session,p_screen,DATE_SUB(v_end,INTERVAL (p_duration*1000) MICROSECOND),v_end,p_duration)
    ON DUPLICATE KEY UPDATE event_id=event_id;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_creator_activity_analytics$$
CREATE PROCEDURE sp_creator_activity_analytics(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_creator CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  SELECT c.id INTO v_creator FROM creators c JOIN users u ON u.id=c.user_id JOIN roles r ON r.id=u.role_id
    WHERE u.id=p_actor AND r.code='CREATOR' AND u.status='ACTIVE';
  IF v_creator IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CREATOR_FORBIDDEN'; END IF;
  SELECT p.name AS platformName,s.followers_count AS followersCount,s.average_views AS averageViews,
    s.engagement_rate AS engagementRate,s.metrics_reported_at AS metricsReportedAt,'SELF-REPORTED' AS source
  FROM creator_social_accounts s JOIN platforms p ON p.id=s.platform_id
  WHERE s.creator_id=v_creator ORDER BY p.name,s.id;
  SELECT COUNT(DISTINCT session_id) AS totalSessions,COUNT(*) AS totalPageViews,
    COALESCE((SELECT ROUND(AVG(sessionMs)) FROM (SELECT SUM(duration_ms) AS sessionMs FROM analytics_events WHERE user_id=p_actor GROUP BY session_id) sessions),0) AS averageSessionDurationMs,
    COALESCE((SELECT screen FROM analytics_events WHERE user_id=p_actor GROUP BY screen ORDER BY COUNT(*) DESC,screen LIMIT 1),NULL) AS mostVisitedPage,
    COALESCE((SELECT screen FROM analytics_events WHERE user_id=p_actor GROUP BY screen ORDER BY SUM(duration_ms) DESC,screen LIMIT 1),NULL) AS highestTimeSpentPage
  FROM analytics_events WHERE user_id=p_actor;
  SELECT screen,COUNT(*) AS pageViews,COUNT(DISTINCT session_id) AS sessions,
    SUM(duration_ms) AS totalDurationMs,ROUND(AVG(duration_ms)) AS averageDurationMs
  FROM analytics_events WHERE user_id=p_actor GROUP BY screen
  ORDER BY pageViews DESC,totalDurationMs DESC,screen LIMIT 10;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_admin_user_screen_analytics$$
CREATE PROCEDURE sp_admin_user_screen_analytics(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
  DECLARE v_admin CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
  SELECT u.id INTO v_admin FROM users u JOIN roles r ON r.id=u.role_id
    WHERE u.id=p_actor AND r.code='SUPER_ADMIN' AND u.status='ACTIVE';
  IF v_admin IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ADMIN_FORBIDDEN'; END IF;
  SELECT COUNT(DISTINCT user_id) AS usersTracked,COUNT(DISTINCT CONCAT(user_id,':',session_id)) AS totalSessions,COUNT(*) AS totalPageViews,
    COALESCE((SELECT ROUND(AVG(sessionMs)) FROM (SELECT user_id,session_id,SUM(duration_ms) AS sessionMs FROM analytics_events GROUP BY user_id,session_id) sessions),0) AS averageSessionDurationMs,
    COUNT(DISTINCT CASE WHEN end_time>=UTC_DATE() AND end_time<UTC_DATE()+INTERVAL 1 DAY THEN user_id END) AS activeUsersToday,
    (SELECT screen FROM analytics_events GROUP BY screen ORDER BY COUNT(*) DESC,screen LIMIT 1) AS mostVisitedPage,
    (SELECT screen FROM analytics_events GROUP BY screen ORDER BY SUM(duration_ms) DESC,screen LIMIT 1) AS highestTimeSpentPage
  FROM analytics_events;
  SELECT screen,COUNT(*) AS pageViews,COUNT(DISTINCT user_id) AS users,COUNT(DISTINCT CONCAT(user_id,':',session_id)) AS sessions,
    SUM(duration_ms) AS totalDurationMs,ROUND(AVG(duration_ms)) AS averageDurationMs
  FROM analytics_events GROUP BY screen
  ORDER BY pageViews DESC,totalDurationMs DESC,screen LIMIT 20;
  COMMIT;
END$$
DELIMITER ;
