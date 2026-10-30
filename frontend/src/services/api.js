import axios from 'axios';
export const api = axios.create({ baseURL: `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`, timeout: 15000, withCredentials: true, headers: { 'X-Requested-With': 'InfluenceWeb' } });
let accessToken = null, refreshing = null;
export const setAccessToken = value => { accessToken = value; };
api.interceptors.request.use(config => { if(accessToken) config.headers.Authorization=`Bearer ${accessToken}`; return config; });
export function refreshSession() {
  if (!refreshing) refreshing = api.post('/auth/refresh-token').then(result=>{ setAccessToken(result.data.data.accessToken); return result.data.data; }).catch(error=>{ setAccessToken(null); window.dispatchEvent(new Event('influence-session-ended')); throw error; }).finally(()=>{refreshing=null;});
  return refreshing;
}
api.interceptors.response.use(value=>value, async error=>{
  const original=error.config;
  if(error.response?.status!==401 || !original || original._retried || original.url.startsWith('/auth/login') || original.url.startsWith('/auth/refresh-token') || !accessToken) throw error;
  original._retried=true;
  await refreshSession();
  return api(original);
});
