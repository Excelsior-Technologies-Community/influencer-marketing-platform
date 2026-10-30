CREATE TABLE IF NOT EXISTS content_submission_reviews (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 submission_id CHAR(36) NOT NULL,content_version INT UNSIGNED NOT NULL,
 decision VARCHAR(24) NOT NULL,from_status VARCHAR(24) NOT NULL,to_status VARCHAR(24) NOT NULL,
 reason VARCHAR(500) NOT NULL,actor_user_id CHAR(36) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_content_version_review(submission_id,content_version),
 FOREIGN KEY(submission_id,content_version) REFERENCES content_submission_versions(submission_id,version) ON DELETE CASCADE,
 FOREIGN KEY(actor_user_id) REFERENCES users(id),
 CONSTRAINT chk_content_review_decision CHECK(decision IN ('APPROVE','REJECT','REQUEST_REVISION'))
) ENGINE=InnoDB;
