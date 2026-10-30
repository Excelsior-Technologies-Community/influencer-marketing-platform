CREATE TABLE IF NOT EXISTS campaign_schedules (
  campaign_id CHAR(36) PRIMARY KEY,
  applications_open_at DATETIME(3) NULL,
  application_deadline DATETIME(3) NULL,
  start_at DATETIME(3) NULL,
  content_deadline DATETIME(3) NULL,
  end_at DATETIME(3) NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT chk_campaign_schedule CHECK(
    (applications_open_at IS NULL AND application_deadline IS NULL AND start_at IS NULL AND content_deadline IS NULL AND end_at IS NULL) OR
    (applications_open_at IS NOT NULL AND application_deadline IS NOT NULL AND start_at IS NOT NULL AND content_deadline IS NOT NULL AND end_at IS NOT NULL
      AND applications_open_at<application_deadline AND application_deadline<=start_at AND start_at<content_deadline AND content_deadline<=end_at)
  )
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS campaign_files (
  id CHAR(36) PRIMARY KEY,campaign_id CHAR(36) NOT NULL,
  kind ENUM('BRIEF','REFERENCE') NOT NULL,title VARCHAR(120) NOT NULL,
  file_content MEDIUMBLOB NOT NULL,mime_type VARCHAR(40) NOT NULL,content_hash CHAR(64) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,width SMALLINT UNSIGNED NULL,height SMALLINT UNSIGNED NULL,page_count TINYINT UNSIGNED NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  brief_slot TINYINT GENERATED ALWAYS AS (CASE WHEN kind='BRIEF' THEN 1 ELSE NULL END) STORED,
  UNIQUE KEY uq_campaign_brief(campaign_id,brief_slot),INDEX idx_campaign_files(campaign_id,kind),
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB;
