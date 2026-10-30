CREATE TABLE IF NOT EXISTS creator_profiles (
  creator_id CHAR(36) PRIMARY KEY,
  details JSON NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_creator_profile_creator FOREIGN KEY(creator_id) REFERENCES creators(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS creator_categories (
  creator_id CHAR(36) NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  PRIMARY KEY(creator_id,category_id),
  CONSTRAINT fk_creator_category_creator FOREIGN KEY(creator_id) REFERENCES creators(id) ON DELETE CASCADE,
  CONSTRAINT fk_creator_category_catalog FOREIGN KEY(category_id) REFERENCES categories(id)
) ENGINE=InnoDB;
