CREATE TABLE IF NOT EXISTS content_submission_versions (
 submission_id CHAR(36) NOT NULL,version INT UNSIGNED NOT NULL,
 content_url VARCHAR(2048) NOT NULL,caption TEXT NOT NULL,published_at DATETIME(3) NOT NULL,notes TEXT NOT NULL,
 status VARCHAR(24) NOT NULL,change_type VARCHAR(24) NOT NULL,reason VARCHAR(500) NOT NULL,
 actor_user_id CHAR(36) NOT NULL,created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(submission_id,version),
 FOREIGN KEY(submission_id) REFERENCES content_submissions(id) ON DELETE CASCADE,
 FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS content_evidence_blobs (
 id CHAR(36) PRIMARY KEY,submission_id CHAR(36) NOT NULL,title VARCHAR(120) NOT NULL,
 file_content MEDIUMBLOB NOT NULL,mime_type VARCHAR(40) NOT NULL,content_hash CHAR(64) NOT NULL,
 byte_size INT UNSIGNED NOT NULL,width SMALLINT UNSIGNED NULL,height SMALLINT UNSIGNED NULL,page_count TINYINT UNSIGNED NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_content_evidence_owner(submission_id,id),
 FOREIGN KEY(submission_id) REFERENCES content_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS content_version_evidence (
 submission_id CHAR(36) NOT NULL,version INT UNSIGNED NOT NULL,evidence_id CHAR(36) NOT NULL,
 PRIMARY KEY(submission_id,version,evidence_id),
 FOREIGN KEY(submission_id,version) REFERENCES content_submission_versions(submission_id,version) ON DELETE CASCADE,
 FOREIGN KEY(submission_id,evidence_id) REFERENCES content_evidence_blobs(submission_id,id) ON DELETE CASCADE
) ENGINE=InnoDB;
INSERT INTO content_submission_versions(submission_id,version,content_url,caption,published_at,notes,status,change_type,reason,actor_user_id,created_at)
SELECT cs.id,cs.version,cs.content_url,cs.caption,cs.published_at,cs.notes,cs.status,'INITIAL','Initial content submission',cr.user_id,cs.created_at
FROM content_submissions cs JOIN campaign_creator_allocations x ON x.application_id=cs.application_id JOIN creators cr ON cr.id=x.creator_id
WHERE NOT EXISTS(SELECT 1 FROM content_submission_versions v WHERE v.submission_id=cs.id AND v.version=cs.version);
