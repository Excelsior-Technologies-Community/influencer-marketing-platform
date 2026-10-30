CREATE TABLE IF NOT EXISTS campaign_creator_allocations (
 application_id CHAR(36) PRIMARY KEY,
 campaign_id CHAR(36) NOT NULL,
 creator_id CHAR(36) NOT NULL,
 allocated_by CHAR(36) NOT NULL,
 allocated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_campaign_allocated_creator(campaign_id,creator_id),
 FOREIGN KEY(application_id) REFERENCES campaign_applications(id) ON DELETE CASCADE,
 FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
 FOREIGN KEY(creator_id) REFERENCES creators(id),
 FOREIGN KEY(allocated_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE OR REPLACE SQL SECURITY INVOKER VIEW campaign_applicant_review_windows AS
SELECT c.id,c.title,c.description,c.total_budget,c.currency,c.creator_slots,c.requirements,c.updated_at,b.company_name,
 s.applications_open_at,s.application_deadline,s.start_at,s.content_deadline,s.end_at
FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN users u ON u.id=b.user_id JOIN campaign_schedules s ON s.campaign_id=c.id
WHERE c.status IN ('LIVE','PAUSED','APPLICATION_CLOSED') AND u.role_id=2 AND u.status='ACTIVE'
 AND s.start_at>UTC_TIMESTAMP(3)
 AND s.applications_open_at<s.application_deadline AND s.application_deadline<=s.start_at AND s.start_at<s.content_deadline AND s.content_deadline<=s.end_at
 AND c.total_budget>0 AND c.currency IN ('INR','USD','EUR','GBP') AND c.creator_slots BETWEEN 1 AND 10000
 AND CHAR_LENGTH(TRIM(c.description))>0 AND CHAR_LENGTH(TRIM(c.requirements))>0
 AND EXISTS(SELECT 1 FROM campaign_platforms x WHERE x.campaign_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM campaign_platforms x JOIN platforms p ON p.id=x.platform_id WHERE x.campaign_id=c.id AND p.is_active=FALSE)
 AND EXISTS(SELECT 1 FROM campaign_categories x WHERE x.campaign_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM campaign_categories x JOIN categories k ON k.id=x.category_id LEFT JOIN categories parent ON parent.id=k.parent_id WHERE x.campaign_id=c.id AND (k.is_active=FALSE OR parent.is_active=FALSE))
 AND EXISTS(SELECT 1 FROM campaign_content_types x WHERE x.campaign_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM campaign_content_types x JOIN content_types t ON t.id=x.content_type_id WHERE x.campaign_id=c.id AND t.is_active=FALSE)
 AND EXISTS(SELECT 1 FROM campaign_deliverables d WHERE d.campaign_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM campaign_deliverables d WHERE d.campaign_id=c.id AND (d.quantity<1 OR d.quantity>100 OR NOT EXISTS(SELECT 1 FROM campaign_platforms p WHERE p.campaign_id=c.id AND p.platform_id=d.platform_id) OR NOT EXISTS(SELECT 1 FROM campaign_content_types t WHERE t.campaign_id=c.id AND t.content_type_id=d.content_type_id)))
 AND EXISTS(SELECT 1 FROM campaign_files f WHERE f.campaign_id=c.id AND f.kind='BRIEF');
