CREATE TABLE IF NOT EXISTS campaign_applications (
 id CHAR(36) PRIMARY KEY,
 campaign_id CHAR(36) NOT NULL,
 creator_id CHAR(36) NOT NULL,
 pitch TEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_campaign_creator_application(campaign_id,creator_id),
 FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
 FOREIGN KEY(creator_id) REFERENCES creators(id),
 CONSTRAINT chk_application_status CHECK(status IN ('PENDING','SHORTLISTED','APPROVED','REJECTED','WITHDRAWN')),
 INDEX idx_creator_application_updated(creator_id,updated_at,id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS campaign_application_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 application_id CHAR(36) NOT NULL,
 actor_user_id CHAR(36) NOT NULL,
 from_status VARCHAR(24) NULL,
 to_status VARCHAR(24) NOT NULL,
 reason VARCHAR(500) NULL,
 application_revision INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(application_id) REFERENCES campaign_applications(id) ON DELETE CASCADE,
 FOREIGN KEY(actor_user_id) REFERENCES users(id),
 INDEX idx_application_history(application_id,id)
) ENGINE=InnoDB;
CREATE OR REPLACE SQL SECURITY INVOKER VIEW creator_campaign_eligibility AS
SELECT u.id AS user_id,c.id AS creator_id,ca.id AS campaign_id,
 (c.verification_status='VERIFIED') AS identity_ready,
 (CHAR_LENGTH(TRIM(c.bio))>0 AND CHAR_LENGTH(TRIM(c.location))>0 AND JSON_TYPE(JSON_EXTRACT(p.details,'$.languages'))='ARRAY' AND JSON_LENGTH(p.details,'$.languages')>0) AS profile_ready,
 EXISTS(SELECT 1 FROM creator_categories cc JOIN categories cat ON cat.id=cc.category_id LEFT JOIN categories parent ON parent.id=cat.parent_id JOIN campaign_categories wanted ON wanted.campaign_id=ca.id JOIN categories target ON target.id=wanted.category_id WHERE cc.creator_id=c.id AND cat.is_active=TRUE AND (parent.id IS NULL OR parent.is_active=TRUE) AND (cat.id=target.id OR cat.parent_id=target.id OR target.parent_id=cat.id)) AS category_ready,
 EXISTS(SELECT 1 FROM creator_social_accounts s JOIN platforms platform ON platform.id=s.platform_id JOIN campaign_platforms wanted ON wanted.campaign_id=ca.id AND wanted.platform_id=s.platform_id WHERE s.creator_id=c.id AND platform.is_active=TRUE) AS platform_ready,
 a.id AS application_id,a.status AS application_status
FROM users u JOIN creators c ON c.user_id=u.id CROSS JOIN campaigns ca LEFT JOIN creator_profiles p ON p.creator_id=c.id LEFT JOIN campaign_applications a ON a.campaign_id=ca.id AND a.creator_id=c.id WHERE u.role_id=3 AND u.status='ACTIVE';
