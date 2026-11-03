import { pool } from '../config/db.js';

// Allowlist procedure names; bind every value rather than interpolating input.
const completionProcedures=['sp_resubmit_content','sp_content_progress','sp_complete_content_campaign'];
const fundingProcedures=['sp_funding_read','sp_funding_reserve','sp_funding_attach_order','sp_funding_setup_review','sp_funding_order_lookup','sp_funding_record_payment'];
const walletProcedures=['sp_wallet_summary','sp_wallet_transactions','sp_wallet_payment_history','sp_creator_release_preview','sp_release_creator_payment'];
const reviewProcedures=['sp_campaign_review_transition','sp_campaign_review_list','sp_campaign_review_detail','sp_admin_campaign_review_file'];
const procedures = new Set(['sp_get_roles', 'sp_create_user', 'sp_user_login', 'sp_get_user_by_id', 'sp_create_session', 'sp_get_session', 'sp_rotate_session', 'sp_revoke_session', 'sp_issue_reset', 'sp_change_password']);
for(const name of ['sp_get_admin_role_dashboard','sp_get_brand_role_dashboard','sp_get_creator_role_dashboard'])procedures.add(name);
procedures.add('sp_brand_campaign_analytics');
for(const name of ['sp_track_analytics_event','sp_creator_activity_analytics','sp_admin_user_screen_analytics'])procedures.add(name);
procedures.add('sp_analytics_report');
for(const name of ['sp_campaign_workspaces','sp_campaign_workspace','sp_campaign_workspace_file'])procedures.add(name);
for(const name of ['sp_creator_content_submissions','sp_submit_content'])procedures.add(name);
for(const name of ['sp_content_history','sp_edit_content','sp_change_content_evidence','sp_content_evidence_file'])procedures.add(name);
for(const name of ['sp_brand_content_list','sp_brand_content_history','sp_brand_review_content','sp_brand_content_evidence'])procedures.add(name);
for(const name of completionProcedures)procedures.add(name);
for(const name of fundingProcedures)procedures.add(name);
for(const name of walletProcedures)procedures.add(name);
for(const name of ['sp_refund_read','sp_refund_reserve','sp_refund_setup_review','sp_refund_payment_lookup','sp_refund_record','sp_refund_review_request','sp_refund_flag_external','sp_admin_payment_reviews','sp_admin_payment_review_note'])procedures.add(name);
for(const name of reviewProcedures)procedures.add(name);
for(const name of ['sp_change_campaign_status','sp_refresh_campaign_status','sp_due_campaign_statuses','sp_get_campaign_lifecycle','sp_delete_campaign','sp_list_campaign_management'])procedures.add(name);
for(const name of ['sp_creator_campaign_catalogs','sp_creator_discover_campaigns','sp_creator_campaign_detail','sp_creator_campaign_file'])procedures.add(name);
for(const name of ['sp_creator_application_eligibility','sp_apply_campaign','sp_withdraw_application','sp_creator_application_detail','sp_creator_applications'])procedures.add(name);
for(const name of ['sp_brand_campaign_applicants','sp_brand_applicant_detail','sp_brand_applicant_file','sp_brand_decide_application'])procedures.add(name);
procedures.add('sp_get_creator_dashboard');
for(const name of ['sp_get_campaign_preparation','sp_save_campaign_schedule','sp_get_campaign_file','sp_save_campaign_file','sp_delete_campaign_file'])procedures.add(name);
for(const name of ['sp_get_campaign','sp_get_campaigns','sp_campaign_catalogs','sp_save_campaign_draft'])procedures.add(name);
for (const name of ['sp_admin_dashboard','sp_admin_registration_trend','sp_admin_list_brands','sp_admin_list_creators','sp_admin_get_account','sp_admin_change_status','sp_admin_verify_creator','sp_admin_list_catalog','sp_admin_get_catalog','sp_admin_save_catalog','sp_admin_list_audit'])procedures.add(name);
for(const name of ['sp_get_brand','sp_update_brand','sp_get_brand_logo','sp_save_brand_logo','sp_delete_brand_logo'])procedures.add(name);
for(const name of ['sp_get_creator','sp_update_creator','sp_get_creator_profile_categories'])procedures.add(name);
for(const name of ['sp_get_creator_social_accounts','sp_save_creator_social_account','sp_delete_creator_social_account'])procedures.add(name);
for(const name of ['sp_get_creator_assets','sp_save_creator_asset','sp_delete_creator_asset'])procedures.add(name);
for(const name of ['sp_campaign_reviews_read','sp_campaign_review_submit'])procedures.add(name);
for(const name of ['sp_campaign_conversations_read','sp_campaign_conversation_messages','sp_campaign_conversation_send','sp_campaign_conversation_mark_read','sp_campaign_message_attachment_file'])procedures.add(name);
for(const name of ['sp_notification_list','sp_notification_unread_count','sp_notification_mark_read','sp_notification_mark_all_read'])procedures.add(name);
for(const name of ['sp_email_enqueue_deadline_reminders','sp_email_outbox_claim','sp_email_outbox_sent','sp_email_outbox_failed'])procedures.add(name);
export async function callProcedure(name, parameters = []) {
  if (!procedures.has(name)) throw new Error('Unsupported database procedure');
  const placeholders = parameters.map(() => '?').join(',');
  const [results] = await pool.execute(`CALL ${name}(${placeholders})`, parameters);
  return results[0];
}
export async function callProcedureSets(name,parameters=[]) {
  if(!procedures.has(name))throw new Error('Unsupported database procedure');
  const [results]=await pool.execute(`CALL ${name}(${parameters.map(()=>'?').join(',')})`,parameters);
  return results.filter(Array.isArray);
}

