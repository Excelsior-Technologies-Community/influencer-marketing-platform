DELIMITER $$
DROP PROCEDURE IF EXISTS sp_edit_content$$
CREATE PROCEDURE sp_edit_content(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT,IN p_url VARCHAR(2048),IN p_caption TEXT,IN p_published DATETIME(3),IN p_notes TEXT,IN p_reason VARCHAR(500),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_current INT;DECLARE v_start DATETIME(3);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 CALL sp_content_write_guard(p_actor,p_campaign,p_submission,p_version,v_current);
 SELECT start_at INTO v_start FROM content_submission_windows WHERE id=p_campaign;
 IF p_url IS NULL OR CHAR_LENGTH(p_url)<10 OR CHAR_LENGTH(p_url)>2048 OR p_url NOT LIKE 'https://%' OR p_caption IS NULL OR CHAR_LENGTH(TRIM(p_caption))<1 OR CHAR_LENGTH(p_caption)>5000 OR p_notes IS NULL OR CHAR_LENGTH(p_notes)>2000 OR p_published IS NULL OR p_published<v_start OR p_published>UTC_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM content_submissions WHERE id=p_submission AND BINARY content_url=BINARY p_url AND BINARY caption=BINARY TRIM(p_caption) AND published_at=p_published AND BINARY notes=BINARY TRIM(p_notes)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NO_CHANGE';END IF;
 UPDATE content_submissions SET content_url=p_url,caption=TRIM(p_caption),published_at=p_published,notes=TRIM(p_notes),version=version+1 WHERE id=p_submission;
 CALL sp_content_snapshot(p_actor,p_submission,'EDIT',p_reason);
 INSERT INTO content_version_evidence(submission_id,version,evidence_id) SELECT submission_id,v_current+1,evidence_id FROM content_version_evidence WHERE submission_id=p_submission AND version=v_current;
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata) VALUES(p_actor,'CONTENT_VERSION_SAVED','content_submissions',p_submission,p_request,JSON_OBJECT('campaignId',p_campaign,'version',v_current+1,'changeType','EDIT'));
 COMMIT;
END$$
DELIMITER ;
