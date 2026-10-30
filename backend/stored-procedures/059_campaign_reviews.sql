DELIMITER $$
DROP PROCEDURE IF EXISTS sp_campaign_review_assert$$
CREATE PROCEDURE sp_campaign_review_assert(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 IF p_role NOT IN ('BRAND_ADMIN','CREATOR') OR NOT EXISTS(
  SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id
  WHERE u.id=p_actor AND u.status='ACTIVE' AND r.code=p_role
 ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_FORBIDDEN';END IF;
 IF p_role='BRAND_ADMIN' THEN
  IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_campaign AND b.user_id=p_actor) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM campaigns c JOIN campaign_creator_allocations x ON x.campaign_id=c.id JOIN campaign_applications a ON a.id=x.application_id AND a.status='APPROVED' JOIN creators cr ON cr.id=x.creator_id WHERE c.id=p_campaign AND cr.user_id=p_actor) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM campaigns WHERE id=p_campaign AND status='COMPLETED') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_CLOSED';
 END IF;
END$$

DROP PROCEDURE IF EXISTS sp_campaign_reviews_read$$
CREATE PROCEDURE sp_campaign_reviews_read(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36))
SQL SECURITY INVOKER
BEGIN
 START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY;
 BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
  CALL sp_campaign_review_assert(p_actor,p_role,p_campaign);
  SELECT c.id,c.title,c.status FROM campaigns c WHERE c.id=p_campaign;
  IF p_role='BRAND_ADMIN' THEN
   SELECT u.id AS userId,u.name AS name,'CREATOR' AS role,
    EXISTS(SELECT 1 FROM campaign_reviews r WHERE r.campaign_id=p_campaign AND r.reviewer_user_id=p_actor AND r.reviewee_user_id=u.id) AS alreadyReviewed
   FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id AND a.status='APPROVED'
   JOIN creators cr ON cr.id=x.creator_id JOIN users u ON u.id=cr.user_id
   WHERE x.campaign_id=p_campaign ORDER BY u.name,u.id;
  ELSE
   SELECT u.id AS userId,b.company_name AS name,'BRAND_ADMIN' AS role,
    EXISTS(SELECT 1 FROM campaign_reviews r WHERE r.campaign_id=p_campaign AND r.reviewer_user_id=p_actor AND r.reviewee_user_id=u.id) AS alreadyReviewed
   FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN users u ON u.id=b.user_id
   WHERE c.id=p_campaign;
  END IF;
  SELECT r.id,r.reviewer_user_id AS reviewerUserId,r.reviewee_user_id AS revieweeUserId,
   COALESCE(reviewer_brand.company_name,reviewer.name) AS reviewerName,
   COALESCE(reviewee_brand.company_name,reviewee.name) AS revieweeName,
   r.rating,r.comment_text AS comment,r.created_at AS createdAt,
   IF(r.reviewer_user_id=p_actor,'GIVEN','RECEIVED') AS direction
  FROM campaign_reviews r
  JOIN users reviewer ON reviewer.id=r.reviewer_user_id
  LEFT JOIN brands reviewer_brand ON reviewer_brand.user_id=reviewer.id
  JOIN users reviewee ON reviewee.id=r.reviewee_user_id
  LEFT JOIN brands reviewee_brand ON reviewee_brand.user_id=reviewee.id
  WHERE r.campaign_id=p_campaign AND (r.reviewer_user_id=p_actor OR r.reviewee_user_id=p_actor)
  ORDER BY r.created_at DESC,r.id DESC;
  COMMIT;
 END;
END$$

DROP PROCEDURE IF EXISTS sp_campaign_review_submit$$
CREATE PROCEDURE sp_campaign_review_submit(IN p_actor CHAR(36),IN p_role VARCHAR(20),IN p_campaign CHAR(36),IN p_reviewee CHAR(36),IN p_rating INT,IN p_comment VARCHAR(1000),IN p_review CHAR(36),IN p_request CHAR(36))
SQL SECURITY INVOKER
BEGIN
 DECLARE v_guard TINYINT UNSIGNED;DECLARE v_locked CHAR(36);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK;RESIGNAL;END;
 START TRANSACTION;
 SELECT id INTO v_guard FROM roles WHERE code='SUPER_ADMIN' FOR UPDATE;
 SELECT id INTO v_locked FROM campaigns WHERE id=p_campaign FOR UPDATE;
 IF v_locked IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_NOT_FOUND';END IF;
 CALL sp_campaign_review_assert(p_actor,p_role,p_campaign);
 IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR (p_comment IS NOT NULL AND CHAR_LENGTH(p_comment)>1000) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_INVALID';
 END IF;
 IF p_role='BRAND_ADMIN' THEN
  IF NOT EXISTS(SELECT 1 FROM campaign_creator_allocations x JOIN campaign_applications a ON a.id=x.application_id AND a.status='APPROVED' JOIN creators cr ON cr.id=x.creator_id WHERE x.campaign_id=p_campaign AND cr.user_id=p_reviewee) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_TARGET';
  END IF;
 ELSEIF NOT EXISTS(SELECT 1 FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE c.id=p_campaign AND b.user_id=p_reviewee) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_TARGET';
 END IF;
 IF p_reviewee=p_actor THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_TARGET';END IF;
 IF EXISTS(SELECT 1 FROM campaign_reviews WHERE campaign_id=p_campaign AND reviewer_user_id=p_actor AND reviewee_user_id=p_reviewee) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_DUPLICATE';
 END IF;
 INSERT INTO campaign_reviews(id,campaign_id,reviewer_user_id,reviewee_user_id,rating,comment_text)
 VALUES(p_review,p_campaign,p_actor,p_reviewee,p_rating,NULLIF(TRIM(p_comment),''));
 INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata)
 VALUES(p_actor,'CAMPAIGN_REVIEW_CREATED','campaign_reviews',p_review,p_request,JSON_OBJECT('campaignId',p_campaign,'revieweeUserId',p_reviewee,'rating',p_rating));
 COMMIT;
 SELECT id,campaign_id AS campaignId,reviewer_user_id AS reviewerUserId,reviewee_user_id AS revieweeUserId,rating,comment_text AS comment,created_at AS createdAt
 FROM campaign_reviews WHERE id=p_review;
END$$
DELIMITER ;
