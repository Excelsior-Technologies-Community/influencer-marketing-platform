DELIMITER $$
DROP PROCEDURE IF EXISTS sp_email_outbox_failed$$
CREATE PROCEDURE sp_email_outbox_failed(IN p_id CHAR(36),IN p_error_code VARCHAR(40))
SQL SECURITY INVOKER
BEGIN
 UPDATE email_outbox
 SET status=IF(p_error_code='INVALID_RECIPIENT' OR attempts>=8,'DEAD','PENDING'),
     available_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL CASE attempts WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 15 WHEN 4 THEN 60 ELSE 360 END MINUTE),
     locked_until=NULL,
     last_error_code=LEFT(COALESCE(p_error_code,'DELIVERY_FAILED'),40)
 WHERE id=p_id AND status='SENDING';
END$$
DELIMITER ;
