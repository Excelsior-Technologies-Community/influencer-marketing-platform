CREATE TABLE IF NOT EXISTS campaigns (
  id CHAR(36) PRIMARY KEY,
  brand_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NULL,
  total_budget DECIMAL(11,2) NULL,
  currency CHAR(3) NOT NULL,
  creator_slots INT UNSIGNED NOT NULL DEFAULT 1,
  requirements TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_campaign_brand FOREIGN KEY(brand_id) REFERENCES brands(id),
  CONSTRAINT chk_campaign_budget CHECK(total_budget IS NULL OR total_budget>0),
  CONSTRAINT chk_campaign_slots CHECK(creator_slots BETWEEN 1 AND 10000),
  INDEX idx_campaign_brand_updated(brand_id,updated_at,id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS campaign_platforms (
  campaign_id CHAR(36) NOT NULL,platform_id INT UNSIGNED NOT NULL,
  PRIMARY KEY(campaign_id,platform_id),
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY(platform_id) REFERENCES platforms(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS campaign_categories (
  campaign_id CHAR(36) NOT NULL,category_id INT UNSIGNED NOT NULL,
  PRIMARY KEY(campaign_id,category_id),
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY(category_id) REFERENCES categories(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS campaign_content_types (
  campaign_id CHAR(36) NOT NULL,content_type_id INT UNSIGNED NOT NULL,
  PRIMARY KEY(campaign_id,content_type_id),
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY(content_type_id) REFERENCES content_types(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS campaign_deliverables (
  campaign_id CHAR(36) NOT NULL,platform_id INT UNSIGNED NOT NULL,content_type_id INT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,description VARCHAR(1000) NULL,
  PRIMARY KEY(campaign_id,platform_id,content_type_id),
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY(platform_id) REFERENCES platforms(id),
  FOREIGN KEY(content_type_id) REFERENCES content_types(id),
  CONSTRAINT chk_campaign_quantity CHECK(quantity BETWEEN 1 AND 100)
) ENGINE=InnoDB;
