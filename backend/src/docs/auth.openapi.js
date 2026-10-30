const requestHeader = { in: 'header', name: 'X-Requested-With', required: true, schema: { type: 'string', enum: ['InfluenceWeb'] }, description: 'Required for all mutations as request protection. Browser Origin must match CLIENT_URL. Local development also allows localhost, 127.0.0.1 and [::1] with the same protocol and port when CLIENT_URL is loopback.' };
const email = { type: 'string', format: 'email', maxLength: 254 };
const password = { type: 'string', minLength: 12, maxLength: 72, description: 'Maximum 72 UTF-8 bytes.' };
const response = (description, success = true) => ({ description, content: { 'application/json': { schema: { $ref: `#/components/schemas/${success ? 'Success' : 'Error'}` } } } });
const errors = { 400: response('Invalid or expired reset token', false), 401: response('Invalid authentication, expired/revoked session or refresh replay', false), 403: response('Role, ownership or origin/header denied', false), 409: response('Duplicate email', false), 422: response('Validation failed', false), 429: response('Request limit exceeded', false), 500: response('Unexpected error; details are never exposed', false) };
function post(summary, properties, required, description, status = 200, cookie = false) {
  return { post: { tags: ['Authentication'], summary, description, security: cookie ? [{ refreshCookie: [] }] : [], parameters: [requestHeader], ...(properties ? { requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties, required } } } } } : {}), responses: { [status]: response('Operation completed'), ...errors } } };
}
function get(summary, parameters = [], description = '') {
  return { get: { tags: ['Authentication'], summary, description, security: [{ bearerAuth: [] }], parameters, responses: { 200: response('Sanitized account'), ...errors, 404: response('Account not found', false) } } };
}
export const authPaths = {
  '/auth/register': post('Register a brand or creator', { name: { type:'string',minLength:2,maxLength:120 }, email, password, role: { type:'string',enum:['BRAND_ADMIN','CREATOR'] }, companyName:{type:'string',minLength:2,maxLength:160} }, ['name','email','password','role'], 'Brand registration requires companyName. Public SUPER_ADMIN registration is prohibited. Creates identity/profile transactionally. Sign in after registration.', 201),
  '/auth/login': post('Sign in', { email, password:{type:'string',minLength:1,maxLength:72} }, ['email','password'], 'Returns accessToken and sanitized user; refresh token is sent only as HttpOnly SameSite=Strict cookie, Secure in production. Suspended/inactive accounts are denied.'),
  '/auth/me': get('Get the current account'),
  '/auth/users/{id}': get('Get an owned account or admin-visible account', [{in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}}], 'All roles can read their own account. Only SUPER_ADMIN can read other accounts. No credential fields are returned.'),
  '/auth/refresh-token': post('Rotate refresh token', null, [], 'Requires refresh cookie. Atomically replaces the session; the previous access token becomes invalid. Replay revokes the complete family. Concurrent reuse requires fresh login.', 200, true),
  '/auth/logout': post('Sign out and revoke session family', null, [], 'Idempotent. Clears the refresh cookie and immediately invalidates corresponding access/refresh sessions.', 200, true),
  '/auth/forgot-password': post('Request password reset', {email}, ['email'], 'Always returns the same generic response. SMTP delivery when configured; local development delivery writes private files under .local/mail. Tokens never appear in API responses.'),
  '/auth/reset-password': post('Reset password', {token:{type:'string',pattern:'^[a-f0-9]{64}$'},password}, ['token','password'], 'Consumes hashed single-use token atomically. Revokes all account sessions and increments auth version. Reset links expire and superseding requests invalidate earlier tokens.'),
  '/auth/access/super_admin': get('Check SUPER_ADMIN role access', [], 'Only SUPER_ADMIN.'),
  '/auth/access/brand_admin': get('Check BRAND_ADMIN role access', [], 'Only BRAND_ADMIN.'),
  '/auth/access/creator': get('Check CREATOR role access', [], 'Only CREATOR.')
};
