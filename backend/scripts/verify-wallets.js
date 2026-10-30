import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';

let connection;
try{
 connection=await pool.getConnection();
 await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 const [bad]=await connection.query(`SELECT j.id FROM wallet_journals j LEFT JOIN wallet_entries e ON e.journal_id=j.id
  GROUP BY j.id HAVING MAX(j.status)<>'POSTED' OR (MAX(j.event_type) IN ('FUNDING_CAPTURE','REFUND_PROCESSED') AND COUNT(e.id)<>2)
  OR SUM(CASE WHEN e.direction='CREDIT' THEN e.amount_minor ELSE 0 END)<>MAX(j.amount_minor)
  OR SUM(CASE WHEN e.direction='DEBIT' THEN e.amount_minor ELSE 0 END)<>MAX(j.amount_minor)`);
 assert.equal(bad.length,0,'Unbalanced or unfinished wallet journal');
 const [[source]]=await connection.query(`SELECT COUNT(*) AS n FROM campaign_funding f
  LEFT JOIN campaign_payment_attempts p ON BINARY p.provider_payment_id=BINARY f.captured_payment_id AND p.funding_id=f.id
  LEFT JOIN wallet_journals j ON j.funding_id=f.id AND j.event_type='FUNDING_CAPTURE'
  WHERE f.status='SUCCEEDED' AND (j.id IS NULL OR j.status<>'POSTED' OR j.amount_minor<>f.amount_minor OR j.currency<>f.currency OR p.status IS NULL OR p.status<>'CAPTURED' OR p.amount_minor<>f.amount_minor OR p.currency<>f.currency)`);
 assert.equal(source.n,0,'A captured funding source is missing its matching journal or proof');
 const [[owners]]=await connection.query(`SELECT COUNT(*) AS n FROM wallet_journals j JOIN campaign_funding f ON f.id=j.funding_id
  JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id
  WHERE j.event_type='FUNDING_CAPTURE' AND (NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.direction='CREDIT' AND a.owner_user_id=b.user_id AND a.account_type='BRAND_HELD' AND a.currency=j.currency AND a.mode=j.mode)
  OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.direction='DEBIT' AND a.owner_user_id IS NULL AND a.account_code='RAZORPAY_TEST_CLEARING_INR' AND a.account_type='PROCESSOR_CLEARING' AND a.currency=j.currency AND a.mode=j.mode))`);
 assert.equal(owners.n,0,'Wallet account ownership or clearing entry mismatch');
 const [[releases]]=await connection.query(`SELECT COUNT(*) AS n FROM wallet_journals j JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id
 WHERE j.event_type='CREATOR_RELEASE' AND (j.amount_minor<>f.amount_minor OR j.currency<>f.currency OR j.mode<>'TEST'
 OR NOT EXISTS(SELECT 1 FROM wallet_journals capture WHERE capture.funding_id=j.funding_id AND capture.event_type='FUNDING_CAPTURE' AND capture.status='POSTED' AND capture.amount_minor=j.amount_minor)
 OR (SELECT COALESCE(SUM(r.gross_minor),0) FROM creator_payment_releases r WHERE r.journal_id=j.id)<>j.amount_minor
 OR (SELECT COUNT(*) FROM wallet_entries e WHERE e.journal_id=j.id)<>(SELECT COUNT(*)+1+(SUM(r.commission_minor)>0) FROM creator_payment_releases r WHERE r.journal_id=j.id)
 OR EXISTS(SELECT 1 FROM creator_payment_releases r WHERE r.journal_id=j.id AND (r.commission_bps<>1000 OR r.commission_minor<>FLOOR(r.gross_minor/10) OR r.net_minor<>r.gross_minor-r.commission_minor OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.direction='CREDIT' AND e.amount_minor=r.net_minor AND a.owner_user_id=r.user_id AND a.account_type='CREATOR_EARNINGS' AND a.currency=j.currency AND a.mode=j.mode)))
 OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.direction='DEBIT' AND e.amount_minor=j.amount_minor AND a.owner_user_id=b.user_id AND a.account_type='BRAND_HELD' AND a.currency=j.currency AND a.mode=j.mode)
 OR ((SELECT SUM(r.commission_minor) FROM creator_payment_releases r WHERE r.journal_id=j.id)>0 AND NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.direction='CREDIT' AND a.owner_user_id IS NULL AND a.account_code='PLATFORM_COMMISSION_INR_TEST' AND a.account_type='PLATFORM_COMMISSION' AND a.currency=j.currency AND a.mode=j.mode AND e.amount_minor=(SELECT SUM(r.commission_minor) FROM creator_payment_releases r WHERE r.journal_id=j.id))))`);
 assert.equal(releases.n,0,'Creator release, commission or ownership mismatch');
 const [[refunds]]=await connection.query(`SELECT COUNT(*) AS n FROM wallet_journals j JOIN campaign_funding f ON f.id=j.funding_id JOIN campaigns c ON c.id=f.campaign_id JOIN brands b ON b.id=c.brand_id
 WHERE j.event_type='REFUND_PROCESSED' AND (j.amount_minor<>f.amount_minor OR j.currency<>f.currency OR j.mode<>'TEST'
 OR NOT EXISTS(SELECT 1 FROM campaign_refunds r WHERE r.funding_id=f.id AND r.status='PROCESSED' AND r.provider_refund_id IS NOT NULL AND r.amount_minor=j.amount_minor)
 OR EXISTS(SELECT 1 FROM wallet_journals release_j WHERE release_j.funding_id=f.id AND release_j.event_type='CREATOR_RELEASE')
 OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.direction='DEBIT' AND e.amount_minor=j.amount_minor AND a.owner_user_id=b.user_id AND a.account_type='BRAND_HELD' AND a.currency=j.currency AND a.mode=j.mode)
 OR NOT EXISTS(SELECT 1 FROM wallet_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=j.id AND e.direction='CREDIT' AND e.amount_minor=j.amount_minor AND a.owner_user_id IS NULL AND a.account_code='RAZORPAY_TEST_CLEARING_INR' AND a.account_type='PROCESSOR_CLEARING' AND a.currency=j.currency AND a.mode=j.mode))`);
 assert.equal(refunds.n,0,'Refund journal/source ownership mismatch');
 const [[missingRefunds]]=await connection.query("SELECT COUNT(*) AS n FROM campaign_refunds r LEFT JOIN wallet_journals j ON j.funding_id=r.funding_id AND j.event_type='REFUND_PROCESSED' AND j.status='POSTED' AND j.amount_minor=r.amount_minor WHERE r.status='PROCESSED' AND j.id IS NULL");
 assert.equal(missingRefunds.n,0,'Processed refund is missing its balanced journal');
 const [refundGuards]=await connection.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('refunds_update_guard','refunds_no_delete','refund_history_no_update','refund_history_no_delete','review_cases_update_guard','review_cases_no_delete','review_notes_no_update','review_notes_no_delete')");
 assert.equal(refundGuards.length,8,'Refund/review protection guard missing');
 const [[orphan]]=await connection.query("SELECT COUNT(*) AS n FROM creator_payment_releases r JOIN wallet_journals j ON j.id=r.journal_id WHERE j.status<>'POSTED' OR j.event_type<>'CREATOR_RELEASE'");
 assert.equal(orphan.n,0,'Unposted release details');
 const [releaseGuards]=await connection.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('release_details_insert_guard','release_details_no_update','release_details_no_delete')");
 assert.equal(releaseGuards.length,3,'Release protection trigger missing');
 const [[totals]]=await connection.query("SELECT CAST(COALESCE(SUM(CASE WHEN e.direction='CREDIT' THEN e.amount_minor ELSE 0 END),0) AS CHAR) AS credits,CAST(COALESCE(SUM(CASE WHEN e.direction='DEBIT' THEN e.amount_minor ELSE 0 END),0) AS CHAR) AS debits FROM wallet_entries e JOIN wallet_journals j ON j.id=e.journal_id WHERE j.status='POSTED'");
 assert.equal(BigInt(totals.credits),BigInt(totals.debits));
 const [triggers]=await connection.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('wallet_accounts_no_update','wallet_entries_insert_guard','wallet_entries_no_update','wallet_entries_delete_guard','wallet_journals_insert_guard','wallet_journals_post_guard','wallet_journals_delete_guard','wallet_funding_update_guard','wallet_capture_update_guard','wallet_capture_delete_guard')");
 assert.equal(triggers.length,10,'Wallet protection trigger missing');
 await connection.commit();
 const [[reviews]]=await connection.query("SELECT COUNT(*) AS n FROM payment_review_cases WHERE kind='EXTERNAL_REFUND' AND status='OPEN'");
 console.log('PASS: capture, Creator release and refund journals balance; funding, commission, refund sources and ownership reconcile; all 21 ledger/refund/review guards are installed. No balances or credentials displayed.');
 if(reviews.n>0)console.log('ATTENTION: external refund cases require manual reconciliation. Recorded ledger totals may differ from the provider until reviewed.');
}catch{
 console.error('Wallet verification failed. Check migration history, unfinished/unbalanced journals and captured funding proof. No credentials displayed.');process.exitCode=1;
}finally{if(connection){await connection.rollback();connection.release();}await pool.end();}
