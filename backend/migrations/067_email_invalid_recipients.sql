UPDATE email_outbox
SET status='DEAD',locked_until=NULL,last_error_code='INVALID_RECIPIENT'
WHERE status IN ('PENDING','SENDING')
  AND RIGHT(LOWER(SUBSTRING_INDEX(recipient_email,'@',-1)),8)='.invalid';
