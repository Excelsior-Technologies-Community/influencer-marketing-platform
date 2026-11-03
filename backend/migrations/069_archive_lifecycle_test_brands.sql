-- Archive generated Lifecycle Brand integration-test accounts while keeping
-- their campaign, application, audit and financial history intact.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_admin_list_brands$$
CREATE PROCEDURE sp_admin_list_brands(IN p_search VARCHAR(300),IN p_status VARCHAR(16),IN p_limit INT,IN p_offset INT)
SQL SECURITY INVOKER
BEGIN
  SELECT b.id,u.id AS userId,u.name,u.email,u.phone,u.status,u.created_at AS createdAt,b.company_name AS companyName,b.website,b.industry,b.description
  FROM brands b JOIN users u ON u.id=b.user_id
  WHERE u.status<>'DELETED' AND (p_status IS NULL OR u.status=p_status) AND (p_search='' OR u.name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR u.email LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR b.company_name LIKE CONCAT('%',p_search,'%') ESCAPE '=')
  ORDER BY u.created_at DESC,u.id LIMIT p_limit OFFSET p_offset;
  SELECT COUNT(*) AS total FROM brands b JOIN users u ON u.id=b.user_id
  WHERE u.status<>'DELETED' AND (p_status IS NULL OR u.status=p_status) AND (p_search='' OR u.name LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR u.email LIKE CONCAT('%',p_search,'%') ESCAPE '=' OR b.company_name LIKE CONCAT('%',p_search,'%') ESCAPE '=');
END$$
DELIMITER ;

START TRANSACTION;
INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,request_id,metadata)
SELECT NULL,'SYNTHETIC_ACCOUNT_ARCHIVED','brands',b.id,NULL,
       JSON_OBJECT('reason','Archived generated Lifecycle Brand integration-test account; related history retained.')
FROM brands b JOIN users u ON u.id=b.user_id
WHERE b.company_name='Lifecycle Brand'
  AND u.email LIKE 'applications-%@example.invalid'
  AND u.name IN ('Test BRAND_ADMIN','Test OTHER_BRAND')
  AND u.status<>'DELETED';

UPDATE refresh_sessions rs
JOIN users u ON u.id=rs.user_id
JOIN brands b ON b.user_id=u.id
SET rs.revoked_at=COALESCE(rs.revoked_at,UTC_TIMESTAMP(6))
WHERE b.company_name='Lifecycle Brand'
  AND u.email LIKE 'applications-%@example.invalid'
  AND u.name IN ('Test BRAND_ADMIN','Test OTHER_BRAND');

UPDATE users u
JOIN brands b ON b.user_id=u.id
SET u.status='DELETED',u.auth_version=u.auth_version+1
WHERE b.company_name='Lifecycle Brand'
  AND u.email LIKE 'applications-%@example.invalid'
  AND u.name IN ('Test BRAND_ADMIN','Test OTHER_BRAND')
  AND u.status<>'DELETED';
COMMIT;
