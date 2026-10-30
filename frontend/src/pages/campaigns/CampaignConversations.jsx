import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {api} from '../../services/api.js';
import {useAuth} from '../../store/auth-context.js';

const date=value=>value?new Date(value).toLocaleString():'Date unavailable';
const formatMessage=message=>message.body|| (message.attachment?'Attachment':'');

export default function CampaignConversations(){
 const {id,applicationId}=useParams(),{user}=useAuth(),base=user?.role==='BRAND_ADMIN'?'/brand':'/creator';
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[page,setPage]=useState(1);
 const [draft,setDraft]=useState(''),[attachment,setAttachment]=useState(null),[title,setTitle]=useState(''),[attachBody,setAttachBody]=useState('');
 useEffect(()=>{setPage(1);setDraft('');setAttachment(null);setTitle('');setAttachBody('');},[id,applicationId]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setData(null);
  const url=applicationId?`${base}/workspaces/${id}/conversations/${applicationId}/messages?page=${page}&pageSize=50`:`${base}/workspaces/${id}/conversations`;
  api.get(url,{signal:controller.signal}).then(async response=>{
   const next=response.data.data;setData(next);
   if(applicationId){
    const unread=next.items.filter(message=>message.senderUserId!==user.id&&!message.isRead).map(message=>message.id);
    if(unread.length){
     try{await api.post(`${base}/workspaces/${id}/conversations/${applicationId}/read`,{messageIds:unread});if(!controller.signal.aborted){const ids=new Set(unread);setData(current=>current?{...current,items:current.items.map(message=>ids.has(message.id)?{...message,isRead:true}:message)}:current);}}
     catch(e){if(!controller.signal.aborted)setError(e.response?.data?.message||'Could not update message read status.');}
    }
   }
  }).catch(e=>{if(!controller.signal.aborted)setError(e.response?.data?.message||'Could not load campaign conversations.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[base,id,applicationId,page,reload,user.id]);
 async function sendMessage(event){
  event.preventDefault();setBusy(true);setError('');
  try{await api.post(`${base}/workspaces/${id}/conversations/${applicationId}/messages`,{body:draft.trim()});setDraft('');setPage(1);setReload(value=>value+1);}
  catch(e){setError(e.response?.data?.message||'Could not send the message. Reload the conversation before retrying.');}
  finally{setBusy(false);}
 }
 async function sendAttachment(event){
  event.preventDefault();if(!attachment)return;const formElement=event.currentTarget;setBusy(true);setError('');
  try{const form=new FormData();form.set('body',attachBody.trim());form.set('title',title.trim());form.set('file',attachment);await api.post(`${base}/workspaces/${id}/conversations/${applicationId}/attachments`,form);setAttachBody('');setTitle('');setAttachment(null);formElement.reset();setPage(1);setReload(value=>value+1);}
  catch(e){setError(e.response?.data?.message||'Could not send the attachment. Reload the conversation before retrying.');}
  finally{setBusy(false);}
 }
 async function download(message){
  if(!message.attachment)return;setBusy(true);setError('');
  try{const response=await api.get(`${base}/workspaces/${id}/conversations/${applicationId}/messages/${message.id}/attachments/${message.attachment.id}`,{responseType:'blob'});const url=URL.createObjectURL(response.data),link=document.createElement('a');link.href=url;link.download=`message-attachment-${message.attachment.id}.${message.attachment.mimeType==='application/pdf'?'pdf':'webp'}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  catch(e){setError(e.response?.data?.message||'Could not download the private attachment.');}
  finally{setBusy(false);}
 }
 const totalPages=data?.meta?.totalPages||1;
 return <div className="campaign-management">
  <div className="eyebrow">CAMPAIGN / MESSAGES</div>
  <div className="brand-actions"><Link to={`${base}/workspaces/${id}`}>← Campaign workspace</Link>{applicationId&&<Link to={`${base}/workspaces/${id}/conversations`}>All conversations</Link>}<button disabled={busy} onClick={()=>setReload(value=>value+1)}>Refresh</button></div>
  <h1>{applicationId?'Campaign conversation.':'Campaign conversations.'}</h1>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {loading?<p role="status">Loading campaign messages…</p>:data&&!applicationId&&<><section className="admin-card"><h2>{data.campaign.title}</h2><p>Each approved Creator has a private conversation with the Brand for this campaign.</p>{!data.items.length?<p>No approved Creator conversations are available.</p>:data.items.map(item=><article key={item.applicationId}>
   <div className="admin-section-heading"><h3>{item.participantName}</h3>{item.unreadCount>0&&<span className="state-pill">{item.unreadCount} unread</span>}</div>
   <p>{item.lastMessage?item.lastMessage:item.lastAttachmentTitle?`Attachment: ${item.lastAttachmentTitle}`:'No messages yet.'}</p>
   {item.lastMessageAt&&<p className="brand-helper">{date(item.lastMessageAt)}</p>}
   <Link to={`${base}/workspaces/${id}/conversations/${item.applicationId}`}>Open conversation ↗</Link>
  </article>)}</section></>}
  {loading?null:data&&applicationId&&<>
   <section className="admin-card"><div className="admin-section-heading"><h2>{data.conversation.title}</h2><span className="state-pill">With {data.conversation.participantName}</span></div><p>Messages and attachments are private to this Brand and approved Creator. Sent messages are retained.</p></section>
   <section className="admin-card"><h2>Messages</h2>
    {!data.items.length?<p>No messages yet. Start the conversation below.</p>:data.items.map(message=><article key={message.id}>
     <div className="admin-section-heading"><h3>{message.senderUserId===user.id?'You':message.senderName}</h3><span className="brand-helper">{date(message.createdAt)}</span></div>
     {message.body&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{formatMessage(message)}</p>}
     {message.attachment&&<p><button type="button" disabled={busy} onClick={()=>download(message)}>Download {message.attachment.title} · {message.attachment.mimeType==='application/pdf'?'PDF':`${Math.ceil(message.attachment.byteSize/1024)} KiB`} ↧</button></p>}
     {message.senderUserId===user.id&&<p className="brand-helper" role="status">{message.isRead?'Read by participant':'Sent'}</p>}
    </article>)}
    <div className="brand-actions"><button disabled={page>=totalPages||busy} onClick={()=>setPage(value=>value+1)}>Older messages</button><span>Page {page} of {totalPages}</span><button disabled={page<=1||busy} onClick={()=>setPage(value=>value-1)}>Newer messages</button></div>
   </section>
   <section className="admin-card"><h2>Send a message</h2><form className="content-submission-form" onSubmit={sendMessage}><fieldset disabled={busy}><label>Message<textarea rows={4} maxLength={4000} required value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Write a message to your campaign participant"/></label><button className="button" disabled={!draft.trim()}>{busy?'Sending…':'Send message'}</button></fieldset></form></section>
   <section className="admin-card"><h2>Send a private attachment</h2><p>Attach one PNG, JPEG, WebP or PDF file up to 5 MiB. Images are normalized and PDFs are checked and sanitized before storage.</p><form className="content-submission-form" onSubmit={sendAttachment}><fieldset disabled={busy}><label>Attachment title<input required minLength={2} maxLength={120} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Campaign reference"/></label><label>File<input required type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={event=>{const selected=event.target.files?.[0]||null;setAttachment(selected);if(selected&&!title)setTitle(selected.name.replace(/\.[^.]+$/,'').slice(0,120));}}/></label><label>Message (optional)<textarea rows={2} maxLength={4000} value={attachBody} onChange={event=>setAttachBody(event.target.value)} placeholder="Add context for this file"/></label><button className="button" disabled={!attachment||title.trim().length<2}>{busy?'Sending…':'Send private attachment'}</button></fieldset></form></section>
  </>}
 </div>;
}
