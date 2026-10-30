import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { useAuth } from '../../store/auth-context.js';
export default function AccountWorkspace({ title }) {
  const { user } = useAuth();
  const [access, setAccess] = useState('Checking access…');
  useEffect(()=>{ const controller=new AbortController(); api.get(`/auth/access/${user.role.toLowerCase()}`, { signal:controller.signal }).then(()=>setAccess('Role access verified')).catch(error=>{if(!controller.signal.aborted)setAccess(error.response?.data?.message||'Could not verify access.');});return ()=>controller.abort();},[user.role]);
  return <><div className="eyebrow">YOUR PROTECTED WORKSPACE</div><h1>{title}</h1><p className="lead">Welcome, {user.name}.</p><section className="empty"><h2>Your account is ready.</h2><dl><dt>Email</dt><dd>{user.email}</dd><dt>Account type</dt><dd>{title}</dd><dt>Status</dt><dd>{user.status}</dd></dl><p role="status">{access}</p><p>Profile tools and campaign workflows will arrive in the next modules.</p></section></>;
}
