CREATE TABLE IF NOT EXISTS wallet_accounts (
 id CHAR(36) PRIMARY KEY,owner_user_id CHAR(36) NULL,
 account_code VARCHAR(100) NOT NULL UNIQUE,
 account_type VARCHAR(24) NOT NULL,currency CHAR(3) NOT NULL DEFAULT 'INR',mode VARCHAR(8) NOT NULL DEFAULT 'TEST',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_wallet_owner_currency(owner_user_id,currency,mode),
 FOREIGN KEY(owner_user_id) REFERENCES users(id),
 CHECK(currency='INR' AND mode='TEST'),
 CHECK((owner_user_id IS NULL AND account_type='PROCESSOR_CLEARING') OR (owner_user_id IS NOT NULL AND account_type IN ('BRAND_HELD','CREATOR_EARNINGS')))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS wallet_journals (
 id CHAR(36) PRIMARY KEY,funding_id CHAR(36) NOT NULL UNIQUE,
 event_type VARCHAR(32) NOT NULL DEFAULT 'FUNDING_CAPTURE',
 currency CHAR(3) NOT NULL DEFAULT 'INR',mode VARCHAR(8) NOT NULL DEFAULT 'TEST',
 amount_minor BIGINT UNSIGNED NOT NULL,status VARCHAR(8) NOT NULL DEFAULT 'DRAFT',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),posted_at DATETIME(6) NULL,
 FOREIGN KEY(funding_id) REFERENCES campaign_funding(id),
 CHECK(amount_minor BETWEEN 100 AND 99999999999),
 CHECK(event_type='FUNDING_CAPTURE' AND currency='INR' AND mode='TEST'),
 CHECK((status='DRAFT' AND posted_at IS NULL) OR (status='POSTED' AND posted_at IS NOT NULL)),
 INDEX idx_wallet_posted(posted_at,id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS wallet_entries (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,journal_id CHAR(36) NOT NULL,account_id CHAR(36) NOT NULL,
 direction VARCHAR(6) NOT NULL,amount_minor BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_wallet_journal_account(journal_id,account_id),
 FOREIGN KEY(journal_id) REFERENCES wallet_journals(id),FOREIGN KEY(account_id) REFERENCES wallet_accounts(id),
 CHECK(direction IN ('CREDIT','DEBIT') AND amount_minor BETWEEN 100 AND 99999999999),
 INDEX idx_wallet_account_journal(account_id,journal_id,id)
) ENGINE=InnoDB;
