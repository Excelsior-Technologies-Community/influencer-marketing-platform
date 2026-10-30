DELIMITER $$
DROP PROCEDURE IF EXISTS sp_notification_actor_assert$$
CREATE PROCEDURE sp_notification_actor_assert(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND status='ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='NOTIFICATION_FORBIDDEN';END IF;
END$$

DROP PROCEDURE IF EXISTS sp_notification_list$$
CREATE PROCEDURE sp_notification_list(IN p_actor CHAR(36),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
  CALL sp_notification_actor_assert(p_actor);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset<0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='NOTIFICATION_QUERY_INVALID';END IF;
  SELECT id,event_type AS eventType,title,body,target_path AS targetPath,entity_type AS entityType,entity_id AS entityId,created_at AS createdAt,read_at AS readAt,(read_at IS NULL) AS unread
  FROM in_app_notifications WHERE recipient_user_id=p_actor ORDER BY created_at DESC,id DESC LIMIT p_limit OFFSET p_offset;
  SELECT COUNT(*) AS total,COALESCE(SUM(read_at IS NULL),0) AS unreadCount FROM in_app_notifications WHERE recipient_user_id=p_actor;
  COMMIT;
 END;
END$$

DROP PROCEDURE IF EXISTS sp_notification_unread_count$$
CREATE PROCEDURE sp_notification_unread_count(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
  CALL sp_notification_actor_assert(p_actor);
  SELECT COUNT(*) AS unreadCount FROM in_app_notifications WHERE recipient_user_id=p_actor AND read_at IS NULL;
  COMMIT;
 END;
END$$

DROP PROCEDURE IF EXISTS sp_notification_mark_read$$
CREATE PROCEDURE sp_notification_mark_read(IN p_actor CHAR(36),IN p_id CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_notification CHAR(36);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 CALL sp_notification_actor_assert(p_actor);
 SELECT id INTO v_notification FROM in_app_notifications WHERE id=p_id AND recipient_user_id=p_actor FOR UPDATE;
 IF v_notification IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='NOTIFICATION_NOT_FOUND';END IF;
 UPDATE in_app_notifications SET read_at=UTC_TIMESTAMP(6) WHERE id=v_notification AND recipient_user_id=p_actor AND read_at IS NULL;
 COMMIT;
 SELECT id,event_type AS eventType,title,body,target_path AS targetPath,created_at AS createdAt,read_at AS readAt,FALSE AS unread FROM in_app_notifications WHERE id=v_notification AND recipient_user_id=p_actor;
END$$

DROP PROCEDURE IF EXISTS sp_notification_mark_all_read$$
CREATE PROCEDURE sp_notification_mark_all_read(IN p_actor CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_updated INT DEFAULT 0;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 CALL sp_notification_actor_assert(p_actor);
 UPDATE in_app_notifications SET read_at=UTC_TIMESTAMP(6) WHERE recipient_user_id=p_actor AND read_at IS NULL;
 SET v_updated=ROW_COUNT();
 COMMIT;
 SELECT v_updated AS updatedCount;
END$$
DELIMITER ;
