import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useAuth } from '../../store/auth-context.js';
import { rolePath } from '../../utils/role-path.js';
const titles = { login: 'Welcome back.', register: 'Find your next collaboration.', forgot: 'Forgot your password?', reset: 'Choose a new password.' };
export default function AuthPage({ mode }) {
  const { login, user, endSession } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [role, setRole] = useState('CREATOR');
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === 'login') { const account = await login(values); navigate(rolePath(account.role), { replace: true }); }
      if (mode === 'register') {
        const body = { name: values.name, email: values.email, password: values.password, role };
        if (role === 'BRAND_ADMIN') body.companyName = values.companyName;
        await api.post('/auth/register', body); setMessage('Account created. You can now sign in.');
      }
      if (mode === 'forgot') { const result = await api.post('/auth/forgot-password', values); setMessage(result.data.message); }
      if (mode === 'reset') {
        const token = new URLSearchParams(location.hash.slice(1)).get('token') || new URLSearchParams(location.search).get('token') || '';
        await api.post('/auth/reset-password', { token, password: values.password }); endSession(); setMessage('Password updated. Please sign in again.');
      }
    } catch (failure) {
      setError(failure.response?.data?.errors?.map(item => item.message).join('. ') || failure.response?.data?.message || 'Could not connect. Please try again.');
    } finally { setBusy(false); }
  }
  return <section className="auth-card"><div className="eyebrow">YOUR INFLUENCE ACCOUNT</div><h1>{titles[mode]}</h1>{user && mode==='login' ? <Link className="button" to={rolePath(user.role)}>Open your workspace ↗</Link> : <form onSubmit={submit}>
    {mode==='register' && <><label>Your name<input name="name" autoComplete="name" minLength={2} maxLength={120} required /></label><label>Account type<select value={role} onChange={event=>setRole(event.target.value)}><option value="CREATOR">Creator</option><option value="BRAND_ADMIN">Brand Admin</option></select></label>{role==='BRAND_ADMIN' && <label>Company name<input name="companyName" minLength={2} maxLength={160} required /></label>}</>}
    {mode!=='reset' && <label>Email address<input type="email" name="email" autoComplete="email" maxLength={254} required /></label>}
    {mode!=='forgot' && <label>Password<input type="password" name="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:12} maxLength={72} required /><small>{mode!=='login'?'Use at least 12 characters (up to 72 UTF-8 bytes).':''}</small></label>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
    <button className="button" disabled={busy}>{busy?'Please wait…':{login:'Sign in',register:'Create account',forgot:'Send reset instructions',reset:'Update password'}[mode]}</button>
  </form>}
  <div className="auth-links">{mode==='login'?<><Link to="/register">Create an account</Link><Link to="/forgot-password">Forgot password?</Link></>:<Link to="/login">Back to sign in</Link>}</div></section>;
}
