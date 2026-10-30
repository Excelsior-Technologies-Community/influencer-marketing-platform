import {useEffect,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {api} from '../../services/api.js';

const date=value=>value?new Date(value).toLocaleString():'Date unavailable';
const safePath=value=>typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')?value:'/notifications';

export default function NotificationInbox(){
 const [params,setParams]=useSearchParams(),navigate=useNavigate(),page=Number(params.get('page')||1),key=params.toString();
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');api.get(`/notifications?${key}`,{signal:controller.signal}).then(response=>setData({items:response.data.data.items,meta:response.data.meta})).catch(e=>{if(!controller.signal.aborted)setError(e.response?.data?.message||'Could not load your notifications.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[key]);
 async function markOne(id){
  setBusy(id);setError('');
  try{await api.post(`/notifications/${id}/read`);setData(current=>current?{...current,items:current.items.map(item=>item.id===id?{...item,unread:false,readAt:new Date().toISOString()}:item),meta:{...current.meta,unreadCount:Math.max(0,current.meta.unreadCount-1)}}:current);}
  catch(e){setError(e.response?.data?.message||'Could not mark this notification as read.');}
  finally{setBusy('');}
 }
 async function open(item){if(item.unread)await markOne(item.id);navigate(safePath(item.targetPath));}
 async function markAll(){
  setBusy('all');setError('');
  try{await api.post('/notifications/read-all');setData(current=>current?{...current,items:current.items.map(item=>({...item,unread:false,readAt:item.readAt||new Date().toISOString()})),meta:{...current.meta,unreadCount:0}}:current);}
  catch(e){setError(e.response?.data?.message||'Could not mark notifications as read.');}
  finally{setBusy('');}
 }
 const meta=data?.meta,totalPages=Math.max(1,meta?.totalPages||1);
 return <div className="campaign-management">
  <div className="eyebrow">YOUR ACCOUNT / UPDATES</div>
  <div className="admin-section-heading"><div><h1>Notifications.</h1><p className="lead">Application, content and payment updates for your account.</p></div><button disabled={busy==='all'||!meta?.unreadCount} onClick={markAll}>{busy==='all'?'Updating…':'Mark all as read'}</button></div>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {meta&&<p role="status">{meta.unreadCount} unread · {meta.total} total</p>}
  {loading?<p role="status">Loading notifications…</p>:data&&<section className="admin-card" aria-label="Your notifications">
   {!data.items.length?<p>No notifications yet. Updates about applications, content reviews and payments will appear here.</p>:data.items.map(item=><article key={item.id}>
    <div className="admin-section-heading"><h2>{item.title}</h2><span className="state-pill">{item.unread?'Unread':'Read'}</span></div>
    <p style={{whiteSpace:'pre-wrap'}}>{item.body}</p>
    <p className="brand-helper">{date(item.createdAt)} · {item.eventType.replaceAll('_',' ').toLowerCase()}</p>
    <div className="brand-actions"><button disabled={busy===item.id} onClick={()=>open(item)}>Open update ↗</button>{item.unread&&<button disabled={Boolean(busy)} onClick={()=>markOne(item.id)}>Mark as read</button>}</div>
   </article>)}
   <div className="brand-actions"><button disabled={page<=1||busy!==''} onClick={()=>setParams({...Object.fromEntries(params),page:page-1})}>Previous</button><span>Page {page} of {totalPages}</span><button disabled={page>=totalPages||busy!==''} onClick={()=>setParams({...Object.fromEntries(params),page:page+1})}>Next</button></div>
  </section>}
  <p><Link to="/">Back to your workspace</Link></p>
 </div>;
}
