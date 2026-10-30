CREATE TABLE IF NOT EXISTS creator_social_accounts (
  id CHAR(36) PRIMARY KEY,
  creator_id CHAR(36) NOT NULL,
  platform_id INT UNSIGNED NOT NULL,
  username VARCHAR(100) NOT NULL,
  profile_url VARCHAR(2048) NOT NULL,
  followers_count BIGINT UNSIGNED NULL,
  average_views BIGINT UNSIGNED NULL,
  engagement_rate DECIMAL(5,2) NULL,
  metrics_reported_at DATETIME(6) NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_creator_social_platform(creator_id,platform_id),
  CONSTRAINT fk_creator_social_owner FOREIGN KEY(creator_id) REFERENCES creators(id) ON DELETE CASCADE,
  CONSTRAINT fk_creator_social_platform FOREIGN KEY(platform_id) REFERENCES platforms(id),
  CONSTRAINT chk_social_engagement CHECK(engagement_rate IS NULL OR engagement_rate BETWEEN 0 AND 100)
) ENGINE=InnoDB;
