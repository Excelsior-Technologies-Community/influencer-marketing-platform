DELIMITER $$
DROP PROCEDURE IF EXISTS sp_content_history$$
CREATE PROCEDURE sp_content_history(IN p_actor CHAR(36),IN p_campaign CHAR(36),IN p_submission CHAR(36),IN p_version INT)
SQL SECURITY INVOKER
BEGIN
 DECLARE v_version INT;
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 CALL sp_content_owner(p_actor,p_campaign,p_submission);
 SELECT COALESCE(p_version,version) INTO v_version FROM content_submissions WHERE id=p_submission;
 IF NOT EXISTS(SELECT 1 FROM content_submission_versions WHERE submission_id=p_submission AND version=v_version) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTENT_NOT_FOUND';END IF;
 SELECT cs.id,cs.version,cs.status,cs.unit_number AS unitNumber,p.name AS platformName,t.name AS contentTypeName,
 (cs.status='SUBMITTED' AND cs.version<50 AND EXISTS(SELECT 1 FROM content_submission_windows w WHERE w.id=p_campaign)) AS canEdit,
 (cs.status='REVISION_REQUESTED' AND cs.version<50 AND EXISTS(SELECT 1 FROM content_submission_windows w WHERE w.id=p_campaign)) AS canResubmit,
 (SELECT COALESCE(SUM(byte_size),0) FROM content_evidence_blobs b WHERE b.submission_id=cs.id) AS retainedBytes
 FROM content_submissions cs JOIN platforms p ON p.id=cs.platform_id JOIN content_types t ON t.id=cs.content_type_id WHERE cs.id=p_submission;
 SELECT version,change_type AS changeType,reason,created_at AS createdAt FROM content_submission_versions WHERE submission_id=p_submission ORDER BY version DESC LIMIT 50;
 SELECT version,content_url AS contentUrl,caption,published_at AS publishedAt,notes,status,change_type AS changeType,reason,created_at AS createdAt FROM content_submission_versions WHERE submission_id=p_submission AND version=v_version;
 SELECT b.id,b.title,b.mime_type AS mimeType,b.byte_size AS byteSize,b.page_count AS pageCount FROM content_version_evidence x JOIN content_evidence_blobs b ON b.id=x.evidence_id AND b.submission_id=x.submission_id WHERE x.submission_id=p_submission AND x.version=v_version ORDER BY b.created_at,b.id;
 SELECT id,content_version AS version,decision,from_status AS fromStatus,to_status AS toStatus,reason,created_at AS createdAt FROM content_submission_reviews WHERE submission_id=p_submission ORDER BY id;
 COMMIT;
 END;
END$$
DELIMITER ;