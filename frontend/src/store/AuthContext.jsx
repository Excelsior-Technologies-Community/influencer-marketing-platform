import { useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken } from '../services/api.js';
import { AuthContext } from './auth-context.js';
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    refreshSession().then(data => { if (mounted) setUser(data.user); }).catch(() => {}).finally(() => { if (mounted) setLoading(false); });
    const lost = () => setUser(null);
    window.addEventListener('influence-session-ended', lost);
    return () => { mounted = false; window.removeEventListener('influence-session-ended', lost); };
  }, []);
  async function login(input) {
    const { data } = await api.post('/auth/login', input);
    setAccessToken(data.data.accessToken); setUser(data.data.user);
    return data.data.user;
  }
  async function logout() {
    await api.post('/auth/logout'); endSession();
  }
  function endSession() { setAccessToken(null); setUser(null); }
  return <AuthContext.Provider value={{ user, loading, login, logout, endSession }}>{children}</AuthContext.Provider>;
}
