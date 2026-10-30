CREATE TABLE IF NOT EXISTS campaign_reviews (
 id CHAR(36) PRIMARY KEY,
 campaign_id CHAR(36) NOT NULL,
 reviewer_user_id CHAR(36) NOT NULL,
 reviewee_user_id CHAR(36) NOT NULL,
 rating TINYINT UNSIGNED NOT NULL,
 comment_text VARCHAR(1000) NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_campaign_review_pair(campaign_id,reviewer_user_id,reviewee_user_id),
 CONSTRAINT fk_campaign_review_campaign FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
 CONSTRAINT fk_campaign_review_reviewer FOREIGN KEY(reviewer_user_id) REFERENCES users(id),
 CONSTRAINT fk_campaign_review_reviewee FOREIGN KEY(reviewee_user_id) REFERENCES users(id),
 CONSTRAINT chk_campaign_review_rating CHECK(rating BETWEEN 1 AND 5),
 CONSTRAINT chk_campaign_review_distinct_users CHECK(reviewer_user_id<>reviewee_user_id),
 INDEX idx_campaign_review_reviewee(campaign_id,reviewee_user_id,created_at)
) ENGINE=InnoDB;

DELIMITER $$
DROP TRIGGER IF EXISTS campaign_reviews_no_update$$
CREATE TRIGGER campaign_reviews_no_update BEFORE UPDATE ON campaign_reviews
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_IMMUTABLE';
END$$
DROP TRIGGER IF EXISTS campaign_reviews_no_delete$$
CREATE TRIGGER campaign_reviews_no_delete BEFORE DELETE ON campaign_reviews
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CAMPAIGN_REVIEW_IMMUTABLE';
END$$
DELIMITER ;
