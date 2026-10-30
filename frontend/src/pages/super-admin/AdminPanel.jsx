import { useEffect,useState } from 'react';
import { NavLink,useLocation } from 'react-router-dom';
import { api } from '../../services/api.js';
import CreatorEvidence from './CreatorEvidence.jsx';
import AdminUserActivity from './AdminUserActivity.jsx';
import FinancialReports from '../analytics/FinancialReports.jsx';
const sections=[['','Overview'],['analytics','User activity'],['analytics/reports','Financial reports'],['brands','Brands'],['creators','Creators'],['categories','Categories'],['platforms','Platforms'],['content-types','Content types'],['audit-logs','Audit history']];
const titleOf=kind=>sections.find(([path])=>path===kind)?.[1]||'Overview';
const failureText=error=>error.response?.data?.errors?.map(value=>value.message).join('. ')||error.response?.data?.message||'Could not connect. Please try again.';
const dateText=value=>value?new Date(value).toLocaleString():'';
function useRecords(path,query,version=0) {
  const [state,setState]=useState({loading:true,error:'',data:null,meta:{}});
  const key=JSON.stringify(query);
  useEffect(()=>{
    const controller=new AbortController();setState(old=>({...old,loading:true,error:''}));
    api.get(path,{params:JSON.parse(key),signal:controller.signal}).then(result=>setState({loading:false,error:'',data:result.data.data,meta:result.data.meta})).catch(error=>{if(!controller.signal.aborted)setState({loading:false,error:failureText(error),data:null,meta:{}});});
    return ()=>controller.abort();
  },[path,key,version]);
  return state;
}
function Feedback({loading,error}) {return <>{loading&&<p role="status">Loading…</p>}{error&&<p className="form-error" role="alert">{error}</p>}</>;}
function Pager({meta,query,setQuery,loading}) {
  return <div className="admin-pagination"><span>{meta.total||0} records · Page {query.page} of {Math.max(1,meta.totalPages||0)}</span><button disabled={loading||query.page<=1} onClick={()=>setQuery({...query,page:query.page-1})}>Previous</button><button disabled={loading||query.page>=(meta.totalPages||0)} onClick={()=>setQuery({...query,page:query.page+1})}>Next</button></div>;
}
function FilterForm({kind,onSearch}) {
  return <form className="admin-filters" onSubmit={event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));onSearch(Object.fromEntries(Object.entries(values).filter(([,value])=>value!=='')));}}>
    <label>Search<input name="q" placeholder={['brands','creators'].includes(kind)?'Name, email or company':'Name or code'} maxLength={100}/></label>
    {['brands','creators'].includes(kind)&&<label>Account status<select name="status"><option value="">All statuses</option>{['ACTIVE','INACTIVE','SUSPENDED'].map(value=><option key={value}>{value}</option>)}</select></label>}
    {kind==='creators'&&<label>Verification<select name="verification"><option value="">All verification states</option>{['PENDING','UNDER_REVIEW','VERIFIED','REJECTED'].map(value=><option key={value}>{value}</option>)}</select></label>}
    {['categories','platforms','content-types'].includes(kind)&&<label>Availability<select name="active"><option value="">All entries</option><option value="true">Active</option><option value="false">Inactive</option></select></label>}
    <button className="button" type="submit">Apply filters</button>
  </form>;
}
function Dashboard() {
  const [version,setVersion]=useState(0);const state=useRecords('/admin/dashboard',{},version);
  const cards=[['totalBrands','Brands'],['totalCreators','Creators'],['activeAccounts','Active accounts'],['suspendedAccounts','Suspended accounts'],['pendingVerification','Awaiting verification'],['verifiedCreators','Verified creators'],['activeCategories','Active categories'],['activePlatforms','Active platforms'],['activeContentTypes','Active content types']];
  const campaigns=[['totalCampaigns','Total campaigns'],['liveCampaigns','Live campaigns'],['campaignsAwaitingReview','Campaigns awaiting review'],['activeCampaigns','Active campaigns'],['completedCampaigns','Completed campaigns']];
  return <><div className="admin-section-heading"><div><h2>Platform overview</h2><p>Live account, catalog and campaign totals.</p></div><button onClick={()=>setVersion(value=>value+1)}>Refresh</button></div><Feedback {...state}/>{state.data&&!state.loading&&<><div className="admin-stats">{cards.map(([key,label])=><article key={key}><span>{label}</span><strong>{state.data.stats[key]}</strong></article>)}</div><section className="admin-card"><h3>Campaign activity</h3><div className="admin-stats">{campaigns.map(([key,label])=><article key={key}><span>{label}</span><strong>{state.data.stats[key]}</strong></article>)}</div></section><section className="admin-card"><h3>Registrations over the last six months</h3><div className="admin-trend">{state.data.registrations.map(row=>{const brands=Number(row.brands),creators=Number(row.creators),max=Math.max(1,...state.data.registrations.map(item=>Number(item.brands)+Number(item.creators)));return <div key={row.month}><span>{row.month}</span><div className="trend-track"><div style={{width:`${(brands+creators)/max*100}%`}}/></div><small>{brands} brands · {creators} creators</small></div>;})}</div></section></>}</>;
}
function AccountDetails({kind,id,onClose,onChanged}) {
  const [version,setVersion]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const state=useRecords(`/admin/${kind}/${id}`,{},version),account=state.data?.account;
  async function change(event,mode) {
    event.preventDefault();setError('');setMessage('');setBusy(true);
    try {const input=Object.fromEntries(new FormData(event.currentTarget));await api.patch(`/admin/${kind}/${id}/${mode}`,input);setMessage(mode==='status'?'Account status updated. Existing sessions were revoked.':'Verification updated.');setVersion(value=>value+1);onChanged();}
    catch(failure){setError(failureText(failure));}finally{setBusy(false);}
  }
  const verificationOptions=account?({PENDING:['UNDER_REVIEW','VERIFIED','REJECTED'],UNDER_REVIEW:['VERIFIED','REJECTED'],VERIFIED:['UNDER_REVIEW'],REJECTED:['UNDER_REVIEW']}[account.verificationStatus]||[]):[];
  return <section className="admin-card account-details" aria-label="Account details"><div className="admin-section-heading"><h2>Account details</h2><button onClick={onClose}>Close details</button></div><Feedback {...state}/>{account&&!state.loading&&<><h3>{kind==='brands'?account.companyName:account.name}</h3><dl className="detail-grid">{Object.entries(account).filter(([key])=>!['id','userId'].includes(key)).map(([key,value])=><div key={key}><dt>{key.replace(/([A-Z])/g,' $1')}</dt><dd>{value===null||value===''?'Not provided':key.endsWith('At')?dateText(value):String(value)}</dd></div>)}</dl>
    <form className="admin-filters" onSubmit={event=>change(event,'status')} key={`status-${account.status}`}><label>New account status<select name="status" defaultValue={account.status}>{['ACTIVE','INACTIVE','SUSPENDED'].map(value=><option key={value}>{value}</option>)}</select></label><label>Reason for account change<input name="reason" minLength={3} maxLength={500} required/></label><button className="button" disabled={busy}>Update account status</button></form>
    {kind==='creators'&&<CreatorEvidence creatorId={id}/>}
    {kind==='creators'&&<form className="admin-filters" onSubmit={event=>change(event,'verification')} key={`verification-${account.verificationStatus}`}><label>New verification state<select name="status">{verificationOptions.map(value=><option key={value}>{value}</option>)}</select></label><label>Reason for verification change<input name="reason" minLength={3} maxLength={500} required/></label><button className="button" disabled={busy||!verificationOptions.length}>Update verification</button></form>}
    <p className="admin-note">Status updates preserve account history. {kind==='creators'?'Verification can be reopened for review.':'Reactivated accounts must sign in again.'}</p>
  </>}{error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status" className="form-success">{message}</p>}</section>;
}
function Accounts({kind}) {
  const [query,setQuery]=useState({page:1,pageSize:10}),[version,setVersion]=useState(0),[selected,setSelected]=useState(null);
  const state=useRecords(`/admin/${kind}`,query,version);
  return <><FilterForm kind={kind} onSearch={values=>setQuery({...values,page:1,pageSize:10})}/><Feedback {...state}/>{!state.loading&&state.data&&<><div className="admin-table-wrap"><table><thead><tr><th>{kind==='brands'?'Company':'Creator'}</th><th>Email</th><th>Status</th>{kind==='creators'&&<th>Verification</th>}<th>Registered</th><th>Actions</th></tr></thead><tbody>{state.data.items.map(row=><tr key={row.id}><td><strong>{row.companyName||row.name}</strong>{kind==='brands'&&<small>{row.name}</small>}</td><td>{row.email}</td><td><span className={`state-pill ${row.status.toLowerCase()}`}>{row.status}</span></td>{kind==='creators'&&<td>{row.verificationStatus}</td>}<td>{dateText(row.createdAt)}</td><td><button onClick={()=>setSelected(row.id)} aria-label={`Manage ${row.companyName||row.name}`}>Manage</button></td></tr>)}</tbody></table>{!state.data.items.length&&<p className="admin-empty">No accounts match these filters.</p>}</div><Pager meta={state.meta} query={query} setQuery={setQuery} loading={state.loading}/></>}{selected&&<AccountDetails key={selected} kind={kind} id={selected} onClose={()=>setSelected(null)} onChanged={()=>setVersion(value=>value+1)}/>}</>;
}
function CatalogEditor({kind,item,parents,onClose,onSaved}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(event) {
    event.preventDefault();setBusy(true);setError('');const form=new FormData(event.currentTarget);
    const input={name:form.get('name'),isActive:form.get('isActive')==='on'};
    if(kind==='categories')input.parentId=form.get('parentId')?Number(form.get('parentId')):null;else input.code=form.get('code');
    if(item)input.reason=form.get('reason');
    try {if(item)await api.put(`/admin/catalogs/${kind}/${item.id}`,input);else await api.post(`/admin/catalogs/${kind}`,input);onSaved();onClose();}catch(failure){setError(failureText(failure));}finally{setBusy(false);}
  }
  return <section className="admin-card" aria-label="Catalog editor"><div className="admin-section-heading"><h2>{item?'Edit entry':'New entry'}</h2><button onClick={onClose}>Cancel</button></div><form className="catalog-editor" onSubmit={save}><label>Name<input name="name" defaultValue={item?.name||''} minLength={2} maxLength={kind==='categories'?120:60} required/></label>{kind==='categories'?<label>Parent category<select name="parentId" defaultValue={item?.parentId||''}><option value="">Top-level category</option>{parents.filter(parent=>parent.id!==item?.id&&(!parent.parentId)&&(parent.isActive||parent.id===item?.parentId)).map(parent=><option key={parent.id} value={parent.id}>{parent.name}</option>)}</select></label>:<label>Code<input name="code" defaultValue={item?.code||''} pattern="[A-Za-z][A-Za-z0-9_]{1,31}" maxLength={32} required/><small>Unique code, such as INSTAGRAM or REEL.</small></label>}<label className="checkbox-label"><input name="isActive" type="checkbox" defaultChecked={item?.isActive??true}/>Active</label>{item&&<label>Reason for change<input name="reason" minLength={3} maxLength={500} required/></label>}{error&&<p role="alert" className="form-error">{error}</p>}<button className="button" disabled={busy}>{busy?'Saving…':'Save entry'}</button></form></section>;
}
function Catalogs({kind}) {
  const [query,setQuery]=useState({page:1,pageSize:10}),[version,setVersion]=useState(0),[editor,setEditor]=useState(null),[message,setMessage]=useState('');
  const state=useRecords(`/admin/catalogs/${kind}`,query,version);
  const [parents,setParents]=useState([]),[parentError,setParentError]=useState('');
  useEffect(()=>{
    if(kind!=='categories')return;
    const controller=new AbortController();setParentError('');
    async function loadParents(){let page=1,items=[],pages=1;do {const result=await api.get('/admin/catalogs/categories',{params:{page,pageSize:100},signal:controller.signal});items.push(...result.data.data.items);pages=result.data.meta.totalPages;page++;}while(page<=pages);setParents(items);}
    loadParents().catch(error=>{if(!controller.signal.aborted)setParentError(failureText(error));});return()=>controller.abort();
  },[kind,version]);
  return <><div className="admin-section-heading"><p>Manage availability without deleting historical references.</p><button className="button" onClick={()=>{setEditor({item:null});setMessage('');}}>Add {kind==='categories'?'category':kind==='platforms'?'platform':'content type'}</button></div><FilterForm kind={kind} onSearch={values=>setQuery({...values,page:1,pageSize:10})}/><Feedback {...state}/>{parentError&&<p className="form-error" role="alert">{parentError}</p>}{message&&<p className="form-success" role="status">{message}</p>}{editor&&<CatalogEditor key={editor.item?.id||'new'} kind={kind} item={editor.item} parents={parents} onClose={()=>setEditor(null)} onSaved={()=>{setVersion(value=>value+1);setMessage('Catalog entry saved.');}}/>}{state.data&&!state.loading&&<><div className="admin-table-wrap"><table><thead><tr><th>Name</th><th>{kind==='categories'?'Parent':'Code'}</th><th>Availability</th><th>Actions</th></tr></thead><tbody>{state.data.items.map(row=><tr key={row.id}><td>{row.name}</td><td>{kind==='categories'?row.parentName||'Top-level':row.code}</td><td><span className={`state-pill ${row.isActive?'active':'inactive'}`}>{row.isActive?'Active':'Inactive'}</span></td><td><button onClick={()=>{setEditor({item:row});setMessage('');}} aria-label={`Edit ${row.name}`}>Edit</button></td></tr>)}</tbody></table>{!state.data.items.length&&<p className="admin-empty">No catalog entries match these filters.</p>}</div><Pager meta={state.meta} query={query} setQuery={setQuery} loading={state.loading}/></>}</>;
}
function AuditHistory() {
  const [query,setQuery]=useState({page:1,pageSize:10}),[selected,setSelected]=useState(null);const state=useRecords('/admin/audit-logs',query);
  return <><form className="admin-filters" onSubmit={event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));setQuery({...Object.fromEntries(Object.entries(values).filter(([,value])=>value)),page:1,pageSize:10});setSelected(null);}}><label>Action<input name="action" placeholder="ACCOUNT_STATUS_CHANGED" maxLength={100}/></label><label>From date<input name="from" type="date"/></label><label>To date<input name="to" type="date"/></label><button className="button">Apply filters</button></form><Feedback {...state}/>{state.data&&!state.loading&&<><div className="admin-table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record type</th><th>Details</th></tr></thead><tbody>{state.data.items.map(row=><tr key={row.id}><td>{dateText(row.createdAt)}</td><td>{row.actorName||'System'}</td><td>{row.action}</td><td>{row.entityType}</td><td><button onClick={()=>setSelected(row)}>View change</button></td></tr>)}</tbody></table>{!state.data.items.length&&<p className="admin-empty">No audit events match these filters.</p>}</div><Pager meta={state.meta} query={query} setQuery={setQuery} loading={state.loading}/></>}{selected&&<section className="admin-card"><h3>{selected.action}</h3><p>Record: {selected.entityId}</p><p>Request: {selected.requestId||'Not recorded'}</p><pre>{JSON.stringify(selected.metadata,null,2)}</pre><button onClick={()=>setSelected(null)}>Close change</button></section>}</>;
}
export default function AdminPanel() {
  const section=useLocation().pathname.split('/')[2]||'';
  return <><div className="eyebrow">SUPER ADMIN</div><h1>{titleOf(section)}</h1><nav className="admin-tabs" aria-label="Admin sections">{sections.map(([path,title])=><NavLink key={path} to={`/admin${path?`/${path}`:''}`} end>{title}</NavLink>)}</nav>{section===''?<Dashboard/>:section==='analytics'?<AdminUserActivity/>:section==='analytics/reports'?<FinancialReports/>:['brands','creators'].includes(section)?<Accounts key={section} kind={section}/>:['categories','platforms','content-types'].includes(section)?<Catalogs key={section} kind={section}/>:section==='audit-logs'?<AuditHistory/>:<p>Admin page not found.</p>}</>;
}
