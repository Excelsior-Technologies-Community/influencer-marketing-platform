# MySQL entity relationship diagram

Generated from the configured MySQL schema `influencer_marketing` after migrations. Run `npm.cmd run docs:erd` to refresh it. Table columns and foreign-key relationships below reflect the database schema; stored procedures, triggers, views and indexes are separate database objects.

Tables: 52 · Foreign-key relationships: 81 · Views: 6

```mermaid
erDiagram
analytics_events {
  id bigint PK
  event_id char UK
  user_id char FK/index
  session_id char
  screen varchar FK/index
  start_time datetime
  end_time datetime
  duration_ms int
  created_at timestamp
}
audit_logs {
  id bigint PK
  actor_user_id char FK/index nullable
  action varchar
  entity_type varchar FK/index
  entity_id varchar nullable
  request_id char nullable
  metadata json nullable
  created_at timestamp FK/index
}
brand_logos {
  brand_id char PK
  image mediumblob
  mime_type varchar
  content_hash char
  byte_size int
  width smallint
  height smallint
  revision int
  updated_at timestamp
}
brand_profiles {
  brand_id char PK
  details json
  revision int
  logo_revision int
  created_at timestamp
  updated_at timestamp
}
brands {
  id char PK
  user_id char UK
  company_name varchar
  website varchar nullable
  industry varchar nullable
  description text nullable
  created_at timestamp
  updated_at timestamp
}
campaign_application_history {
  id bigint PK
  application_id char FK/index
  actor_user_id char FK/index
  from_status varchar nullable
  to_status varchar
  reason varchar nullable
  application_revision int
  created_at timestamp
}
campaign_applications {
  id char PK
  campaign_id char FK/index
  creator_id char FK/index
  pitch text
  status varchar
  revision int
  created_at timestamp
  updated_at timestamp
}
campaign_categories {
  campaign_id char PK
  category_id int PK
}
campaign_content_types {
  campaign_id char PK
  content_type_id int PK
}
campaign_creator_allocations {
  application_id char PK
  campaign_id char FK/index
  creator_id char FK/index
  allocated_by char FK/index
  allocated_at timestamp
}
campaign_deliverables {
  campaign_id char PK
  platform_id int PK
  content_type_id int PK
  quantity smallint
  description varchar nullable
}
campaign_files {
  id char PK
  campaign_id char FK/index
  kind enum
  title varchar
  file_content mediumblob
  mime_type varchar
  content_hash char
  byte_size int
  width smallint nullable
  height smallint nullable
  page_count tinyint nullable
  revision int
  created_at timestamp
  updated_at timestamp
  brief_slot tinyint nullable
}
campaign_funding {
  id char PK
  campaign_id char UK
  amount_minor bigint
  currency char
  provider_key_id varchar
  provider_order_id varchar UK nullable
  status varchar
  captured_payment_id varchar UK nullable
  created_at timestamp
  updated_at timestamp
}
campaign_lifecycle_history {
  id bigint PK
  campaign_id char FK/index
  actor_user_id char FK/index nullable
  action varchar
  from_status varchar
  to_status varchar
  reason varchar
  campaign_revision int
  created_at timestamp
}
campaign_message_attachments {
  id char PK
  message_id char UK
  title varchar
  mime_type varchar
  byte_size int
  sha256 char
  file_content longblob
  created_at timestamp
}
campaign_message_reads {
  message_id char PK
  reader_user_id char PK
  read_at timestamp nullable
}
campaign_messages {
  id char PK
  campaign_id char
  application_id char FK/index
  sender_user_id char FK/index
  body_text varchar nullable
  created_at timestamp
}
campaign_payment_attempts {
  provider_payment_id varchar PK
  funding_id char FK/index
  status varchar
  amount_minor bigint
  currency char
  created_at timestamp
  updated_at timestamp
}
campaign_payment_events {
  event_id varchar PK
  body_hash char
  funding_id char FK/index
  event_type varchar
  created_at timestamp
}
campaign_platforms {
  campaign_id char PK
  platform_id int PK
}
campaign_refunds {
  id char PK
  funding_id char UK
  amount_minor bigint
  provider_refund_id varchar UK nullable
  status varchar
  reason varchar
  requested_by char FK/index
  created_at timestamp
  updated_at timestamp
}
campaign_review_history {
  id bigint PK
  campaign_id char FK/index
  actor_user_id char FK/index
  from_status varchar
  to_status varchar
  reason varchar nullable
  campaign_revision int
  created_at timestamp
}
campaign_reviews {
  id char PK
  campaign_id char FK/index
  reviewer_user_id char FK/index
  reviewee_user_id char FK/index
  rating tinyint
  comment_text varchar nullable
  created_at timestamp
}
campaign_schedules {
  campaign_id char PK
  applications_open_at datetime nullable
  application_deadline datetime nullable
  start_at datetime nullable
  content_deadline datetime nullable
  end_at datetime nullable
  revision int
  updated_at timestamp
}
campaigns {
  id char PK
  brand_id char FK/index
  title varchar
  description text nullable
  total_budget decimal nullable
  currency char
  creator_slots int
  requirements text nullable
  status varchar
  revision int
  created_at timestamp
  updated_at timestamp
}
categories {
  id int PK
  parent_id int FK/index nullable
  name varchar UK
  is_active tinyint
}
content_evidence_blobs {
  id char PK
  submission_id char FK/index
  title varchar
  file_content mediumblob
  mime_type varchar
  content_hash char
  byte_size int
  width smallint nullable
  height smallint nullable
  page_count tinyint nullable
  created_at timestamp
}
content_submission_reviews {
  id bigint PK
  submission_id char FK/index
  content_version int
  decision varchar
  from_status varchar
  to_status varchar
  reason varchar
  actor_user_id char FK/index
  created_at timestamp
}
content_submission_versions {
  submission_id char PK
  version int PK
  content_url varchar
  caption text
  published_at datetime
  notes text
  status varchar
  change_type varchar
  reason varchar
  actor_user_id char FK/index
  created_at timestamp
}
content_submissions {
  id char PK
  application_id char FK/index
  campaign_id char FK/index
  platform_id int
  content_type_id int
  unit_number smallint
  content_url varchar
  caption text
  published_at datetime
  notes text
  status varchar
  version int
  created_at timestamp
}
content_types {
  id int PK
  code varchar UK
  name varchar
  is_active tinyint
}
content_version_evidence {
  submission_id char PK
  version int PK
  evidence_id char PK
}
creator_assets {
  id char PK
  creator_id char FK/index
  kind enum
  title varchar
  file_content mediumblob
  mime_type varchar
  byte_size int
  content_hash char
  width smallint nullable
  height smallint nullable
  page_count tinyint nullable
  revision int
  created_at timestamp
  updated_at timestamp
  photo_slot tinyint nullable
}
creator_categories {
  creator_id char PK
  category_id int PK
}
creator_payment_releases {
  journal_id char FK/index
  application_id char PK
  user_id char FK/index
  gross_minor bigint
  commission_minor bigint
  net_minor bigint
  commission_bps int
  allocation_order int
}
creator_profiles {
  creator_id char PK
  details json
  revision int
  created_at timestamp
  updated_at timestamp
}
creator_social_accounts {
  id char PK
  creator_id char FK/index
  platform_id int FK/index
  username varchar
  profile_url varchar
  followers_count bigint nullable
  average_views bigint nullable
  engagement_rate decimal nullable
  metrics_reported_at datetime nullable
  revision int
  created_at timestamp
  updated_at timestamp
}
creators {
  id char PK
  user_id char UK
  bio text nullable
  location varchar nullable
  verification_status enum FK/index
  created_at timestamp
  updated_at timestamp
}
email_outbox {
  id char PK
  recipient_user_id char FK/index
  notification_id char UK nullable
  dedupe_key varchar
  recipient_email varchar
  subject varchar
  body_text text
  target_path varchar
  source_type varchar
  source_id char
  status enum FK/index
  attempts tinyint
  available_at datetime
  locked_until datetime nullable
  sent_at datetime nullable
  last_error_code varchar nullable
  created_at timestamp
}
in_app_notifications {
  id char PK
  recipient_user_id char FK/index
  event_key varchar
  event_type varchar
  title varchar
  body varchar
  target_path varchar
  entity_type varchar
  entity_id char
  created_at timestamp
  read_at timestamp nullable
}
password_reset_tokens {
  id char PK
  user_id char FK/index
  token_hash char UK
  expires_at datetime
  used_at datetime nullable
}
payment_review_cases {
  id char PK
  funding_id char FK/index
  case_key varchar UK
  kind varchar
  amount_minor bigint
  provider_refund_id varchar nullable
  provider_status varchar nullable
  reason varchar
  status varchar
  revision int
  created_at timestamp
  updated_at timestamp
}
payment_review_notes {
  id bigint PK
  case_id char FK/index
  actor_user_id char FK/index
  action varchar
  reason varchar
  created_at timestamp
}
platforms {
  id int PK
  code varchar UK
  name varchar
  is_active tinyint
}
refresh_sessions {
  id char PK
  user_id char FK/index
  token_hash char UK
  family_id char FK/index
  expires_at datetime FK/index
  revoked_at datetime nullable
  created_at timestamp
  auth_version int
}
refund_history {
  id bigint PK
  refund_id char FK/index
  status varchar
  created_at timestamp
}
roles {
  id tinyint PK
  code varchar UK
}
schema_migrations {
  name varchar PK
  checksum char
  applied_at timestamp
}
users {
  id char PK
  role_id tinyint FK/index
  name varchar
  email varchar UK
  password_hash varchar
  phone varchar nullable
  status enum
  is_verified tinyint
  created_at timestamp FK/index
  updated_at timestamp
  auth_version int
}
wallet_accounts {
  id char PK
  owner_user_id char FK/index nullable
  account_code varchar UK
  account_type varchar
  currency char
  mode varchar
  created_at timestamp
}
wallet_entries {
  id bigint PK
  journal_id char FK/index
  account_id char FK/index
  direction varchar
  amount_minor bigint
  created_at timestamp
}
wallet_journals {
  id char PK
  funding_id char FK/index
  event_type varchar
  currency char
  mode varchar
  amount_minor bigint
  status varchar
  created_at timestamp
  posted_at datetime FK/index nullable
}
  users ||--o{ analytics_events : "user_id"
  users ||--o{ audit_logs : "actor_user_id"
  brands ||--o{ brand_logos : "brand_id"
  brands ||--o{ brand_profiles : "brand_id"
  users ||--o{ brands : "user_id"
  campaign_applications ||--o{ campaign_application_history : "application_id"
  users ||--o{ campaign_application_history : "actor_user_id"
  campaigns ||--o{ campaign_applications : "campaign_id"
  creators ||--o{ campaign_applications : "creator_id"
  campaigns ||--o{ campaign_categories : "campaign_id"
  categories ||--o{ campaign_categories : "category_id"
  campaigns ||--o{ campaign_content_types : "campaign_id"
  content_types ||--o{ campaign_content_types : "content_type_id"
  campaign_applications ||--o{ campaign_creator_allocations : "application_id"
  campaigns ||--o{ campaign_creator_allocations : "campaign_id"
  creators ||--o{ campaign_creator_allocations : "creator_id"
  users ||--o{ campaign_creator_allocations : "allocated_by"
  campaigns ||--o{ campaign_deliverables : "campaign_id"
  platforms ||--o{ campaign_deliverables : "platform_id"
  content_types ||--o{ campaign_deliverables : "content_type_id"
  campaigns ||--o{ campaign_files : "campaign_id"
  campaigns ||--o{ campaign_funding : "campaign_id"
  campaigns ||--o{ campaign_lifecycle_history : "campaign_id"
  users ||--o{ campaign_lifecycle_history : "actor_user_id"
  campaign_messages ||--o{ campaign_message_attachments : "message_id"
  campaign_messages ||--o{ campaign_message_reads : "message_id"
  users ||--o{ campaign_message_reads : "reader_user_id"
  campaign_applications ||--o{ campaign_messages : "application_id"
  users ||--o{ campaign_messages : "sender_user_id"
  campaign_funding ||--o{ campaign_payment_attempts : "funding_id"
  campaign_funding ||--o{ campaign_payment_events : "funding_id"
  campaigns ||--o{ campaign_platforms : "campaign_id"
  platforms ||--o{ campaign_platforms : "platform_id"
  campaign_funding ||--o{ campaign_refunds : "funding_id"
  users ||--o{ campaign_refunds : "requested_by"
  campaigns ||--o{ campaign_review_history : "campaign_id"
  users ||--o{ campaign_review_history : "actor_user_id"
  campaigns ||--o{ campaign_reviews : "campaign_id"
  users ||--o{ campaign_reviews : "reviewee_user_id"
  users ||--o{ campaign_reviews : "reviewer_user_id"
  campaigns ||--o{ campaign_schedules : "campaign_id"
  brands ||--o{ campaigns : "brand_id"
  categories ||--o{ categories : "parent_id"
  content_submissions ||--o{ content_evidence_blobs : "submission_id"
  content_submission_versions ||--o{ content_submission_reviews : "submission_id"
  content_submission_versions ||--o{ content_submission_reviews : "content_version"
  users ||--o{ content_submission_reviews : "actor_user_id"
  content_submissions ||--o{ content_submission_versions : "submission_id"
  users ||--o{ content_submission_versions : "actor_user_id"
  campaign_creator_allocations ||--o{ content_submissions : "application_id"
  campaign_deliverables ||--o{ content_submissions : "campaign_id"
  campaign_deliverables ||--o{ content_submissions : "platform_id"
  campaign_deliverables ||--o{ content_submissions : "content_type_id"
  content_submission_versions ||--o{ content_version_evidence : "submission_id"
  content_submission_versions ||--o{ content_version_evidence : "version"
  content_evidence_blobs ||--o{ content_version_evidence : "submission_id"
  content_evidence_blobs ||--o{ content_version_evidence : "evidence_id"
  creators ||--o{ creator_assets : "creator_id"
  categories ||--o{ creator_categories : "category_id"
  creators ||--o{ creator_categories : "creator_id"
  wallet_journals ||--o{ creator_payment_releases : "journal_id"
  campaign_creator_allocations ||--o{ creator_payment_releases : "application_id"
  users ||--o{ creator_payment_releases : "user_id"
  creators ||--o{ creator_profiles : "creator_id"
  creators ||--o{ creator_social_accounts : "creator_id"
  platforms ||--o{ creator_social_accounts : "platform_id"
  users ||--o{ creators : "user_id"
  in_app_notifications ||--o{ email_outbox : "notification_id"
  users ||--o{ email_outbox : "recipient_user_id"
  users ||--o{ in_app_notifications : "recipient_user_id"
  users ||--o{ password_reset_tokens : "user_id"
  campaign_funding ||--o{ payment_review_cases : "funding_id"
  payment_review_cases ||--o{ payment_review_notes : "case_id"
  users ||--o{ payment_review_notes : "actor_user_id"
  users ||--o{ refresh_sessions : "user_id"
  campaign_refunds ||--o{ refund_history : "refund_id"
  roles ||--o{ users : "role_id"
  users ||--o{ wallet_accounts : "owner_user_id"
  wallet_journals ||--o{ wallet_entries : "journal_id"
  wallet_accounts ||--o{ wallet_entries : "account_id"
  campaign_funding ||--o{ wallet_journals : "funding_id"
```

## Views

- `campaign_applicant_review_windows`
- `campaign_content_progress`
- `campaign_release_plan`
- `content_submission_windows`
- `creator_campaign_eligibility`
- `creator_discoverable_campaigns`

See [System Architecture](ARCHITECTURE.md) for workflow invariants and [Getting Started](GETTING_STARTED.md) for local setup.
