CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(36) NOT NULL UNIQUE,
  user_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  screen VARCHAR(255) NOT NULL,
  start_time DATETIME(3) NOT NULL,
  end_time DATETIME(3) NOT NULL,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_analytics_event_user FOREIGN KEY(user_id) REFERENCES users(id),
  CONSTRAINT chk_analytics_duration CHECK(duration_ms<=1800000 AND end_time>=start_time),
  INDEX idx_analytics_user_end(user_id,end_time,id),
  INDEX idx_analytics_session_user(user_id,session_id),
  INDEX idx_analytics_screen_end(screen,end_time)
) ENGINE=InnoDB;
