CREATE TABLE IF NOT EXISTS content_submissions (
 id CHAR(36) PRIMARY KEY,
 application_id CHAR(36) NOT NULL,
 campaign_id CHAR(36) NOT NULL,
 platform_id INT UNSIGNED NOT NULL,
 content_type_id INT UNSIGNED NOT NULL,
 unit_number SMALLINT UNSIGNED NOT NULL,
 content_url VARCHAR(2048) NOT NULL,
 caption TEXT NOT NULL,
 published_at DATETIME(3) NOT NULL,
 notes TEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_content_deliverable_unit(application_id,platform_id,content_type_id,unit_number),
 FOREIGN KEY(application_id) REFERENCES campaign_creator_allocations(application_id),
 FOREIGN KEY(campaign_id,platform_id,content_type_id) REFERENCES campaign_deliverables(campaign_id,platform_id,content_type_id),
 CONSTRAINT chk_content_unit CHECK(unit_number BETWEEN 1 AND 100),
 CONSTRAINT chk_content_version CHECK(version>=1),
 INDEX idx_content_campaign(campaign_id,created_at)
) ENGINE=InnoDB;
CREATE OR REPLACE SQL SECURITY INVOKER VIEW content_submission_windows AS
SELECT c.id,s.start_at,s.content_deadline FROM campaigns c JOIN campaign_schedules s ON s.campaign_id=c.id
JOIN brands b ON b.id=c.brand_id JOIN users u ON u.id=b.user_id
WHERE c.status='IN_PROGRESS' AND u.status='ACTIVE' AND u.role_id=2
AND s.start_at<=UTC_TIMESTAMP(3) AND s.content_deadline>UTC_TIMESTAMP(3)
AND s.start_at<s.content_deadline AND s.content_deadline<=s.end_at;
