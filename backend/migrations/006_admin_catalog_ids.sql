ALTER TABLE platforms MODIFY COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE content_types MODIFY COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT;
CREATE INDEX idx_creators_verification ON creators(verification_status);
CREATE INDEX idx_users_created ON users(created_at);
