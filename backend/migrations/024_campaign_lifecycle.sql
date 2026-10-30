CREATE TABLE IF NOT EXISTS campaign_lifecycle_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 campaign_id CHAR(36) NOT NULL,
 actor_user_id CHAR(36) NULL,
 action VARCHAR(32) NOT NULL,
 from_status VARCHAR(32) NOT NULL,
 to_status VARCHAR(32) NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 campaign_revision INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
 FOREIGN KEY(actor_user_id) REFERENCES users(id),
 INDEX idx_lifecycle_campaign(campaign_id,id)
) ENGINE=InnoDB;
