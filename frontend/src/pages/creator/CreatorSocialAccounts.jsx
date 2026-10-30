import { useEffect,useState } from 'react';
import { api } from '../../services/api.js';
const blank={platformId:'',username:'',profileUrl:'',followersCount:'',averageViews:'',engagementRate:''};
const errorText=error=>error.response?.data?.errors?.map(item=>`${item.field}: ${item.message}`).join('. ')||error.response?.data?.message||'Could not connect. Please try again.';
const count=value=>value===null?'Not provided':Number(value).toLocaleString();
export default function CreatorSocialAccounts(){
  const [data,setData]=useState({items:[],platforms:[]}),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[reload,setReload]=useState(0);
  const [form,setForm]=useState(blank),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[removing,setRemoving]=useState(null);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setLoadError('');api.get('/creator/social-accounts',{signal:controller.signal}).then(result=>setData(result.data.data)).catch(failure=>{if(!controller.signal.aborted)setLoadError(errorText(failure));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[reload]);
  const change=(name,value)=>setForm(old=>({...old,[name]:value}));
  function reset(){setEditing(null);setForm(blank);setError('');}
  function edit(item){setEditing(item);setRemoving(null);setError('');setNotice('');setForm(Object.fromEntries(Object.keys(blank).map(key=>[key,item[key]??''])));}
  async function save(event){event.preventDefault();setBusy(true);setError('');setNotice('');
    try{const body={username:form.username,profileUrl:form.profileUrl,...Object.fromEntries(['followersCount','averageViews','engagementRate'].map(key=>[key,form[key]===''?null:Number(form[key])]))};
      const result=editing?await api.put(`/creator/social-accounts/${editing.id}`,{...body,revision:editing.revision}):await api.post('/creator/social-accounts',{...body,platformId:Number(form.platformId)});
      setData(result.data.data);reset();setNotice(editing?'Social account updated.':'Social account added.');
    }catch(failure){setError(errorText(failure));}finally{setBusy(false);}
  }
  async function remove(){setBusy(true);setError('');setNotice('');try{const result=await api.delete(`/creator/social-accounts/${removing.id}`,{data:{revision:removing.revision}});setData(result.data.data);if(editing?.id===removing.id)reset();setRemoving(null);setNotice('Social account removed.');}catch(failure){setError(errorText(failure));}finally{setBusy(false);}}
  const choices=data.platforms.filter(platform=>platform.isAvailable&&!data.items.some(item=>item.platformId===platform.id));
  return <><div className="eyebrow">CREATOR / SOCIAL ACCOUNTS</div><h1>Your social presence.</h1><p className="lead">Keep your social profiles and audience details together.</p>
    <p className="creator-notice">Metrics are self-reported and have not been verified by the platform. Account ownership is not verified. Automatic syncing is not connected.</p>
    {notice&&<p role="status" className="form-success">{notice}</p>}
    {loading?<p role="status">Loading social accounts…</p>:loadError?<section className="admin-card"><p role="alert" className="form-error">{loadError}</p><button onClick={()=>setReload(value=>value+1)}>Retry</button></section>:<div className="social-layout">
      <section className="admin-card"><h2>{editing?`Edit ${editing.platformName} account`:'Add a social account'}</h2><p className="brand-helper">One account per platform · Up to 20 accounts. Use your public profile link.</p>
        <form className="brand-form social-form" onSubmit={save}><fieldset disabled={busy}>
          {editing?<p><strong>Platform:</strong> {editing.platformName}{!editing.isAvailable?' (Unavailable for new accounts)':''}</p>:<label>Platform<select value={form.platformId} onChange={event=>change('platformId',event.target.value)} required><option value="">Choose a platform</option>{choices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {!editing&&!choices.length&&<p className="brand-helper">No unused platforms are available. Your administrator manages the platform catalog.</p>}
          <label>Username<input value={form.username} onChange={event=>change('username',event.target.value)} maxLength={101} required placeholder="your.handle"/></label>
          <label>Profile URL<input value={form.profileUrl} onChange={event=>change('profileUrl',event.target.value)} type="url" maxLength={2048} required placeholder="https://www.instagram.com/your.handle/"/></label>
          <h3>Self-reported metrics</h3><p className="brand-helper">Optional. Leave blank when unknown; enter 0 only when the value is zero.</p>
          <label>Followers / subscribers<input type="number" min="0" max="1000000000000" step="1" value={form.followersCount} onChange={event=>change('followersCount',event.target.value)}/></label>
          <label>Average views<input type="number" min="0" max="1000000000000" step="1" value={form.averageViews} onChange={event=>change('averageViews',event.target.value)}/></label>
          <label>Engagement rate (%)<input type="number" min="0" max="100" step="0.01" value={form.engagementRate} onChange={event=>change('engagementRate',event.target.value)}/></label>
          <div className="brand-actions"><button className="button" disabled={!editing&&(!choices.length||data.items.length>=20)}>{busy?'Saving…':editing?'Save social account':'Add social account'}</button>{editing&&<button type="button" onClick={reset}>Cancel edit</button>}</div>
        </fieldset></form>
      </section>
      <section aria-label="Saved social accounts"><div className="section-heading"><h2>Saved accounts ({data.items.length})</h2><button disabled={busy} onClick={()=>{reset();setRemoving(null);setReload(value=>value+1);}}>Reload accounts</button></div>
        {!data.items.length&&<section className="admin-card"><h3>No social accounts yet</h3><p>Add your first profile using the form.</p></section>}
        {data.items.map(item=><article className="admin-card social-account" key={item.id}><div className="social-card-heading"><h2>{item.platformName}</h2><span className="state-pill">SELF-REPORTED</span></div><h3>@{item.username}</h3><a className="social-url" href={item.profileUrl} target="_blank" rel="noopener noreferrer">View public profile ↗</a>{!item.isAvailable&&<p className="brand-helper">This platform is unavailable for new accounts. You can still edit or remove this saved account.</p>}<dl className="social-metrics"><div><dt>Followers / subscribers</dt><dd>{count(item.followersCount)}</dd></div><div><dt>Average views</dt><dd>{count(item.averageViews)}</dd></div><div><dt>Engagement rate</dt><dd>{item.engagementRate===null?'Not provided':`${item.engagementRate}%`}</dd></div></dl><p className="brand-helper">{item.metricsReportedAt?`Metrics reported ${new Date(item.metricsReportedAt).toLocaleDateString()}`:'No metrics reported'} · Ownership unverified</p><div className="brand-actions"><button disabled={busy} onClick={()=>edit(item)}>Edit {item.platformName}</button><button disabled={busy} onClick={()=>{setRemoving(item);setError('');}}>Remove {item.platformName}</button></div></article>)}
      </section>
    </div>}
    {removing&&<section className="admin-card" role="region" aria-label="Confirm account removal"><h2>Remove {removing.platformName} account?</h2><p>This removes the saved link and manual metrics from your profile. Your account on {removing.platformName} is unaffected.</p><div className="brand-actions"><button disabled={busy} onClick={remove}>Confirm removal</button><button disabled={busy} onClick={()=>setRemoving(null)}>Keep account</button></div></section>}
    {error&&<section className="creator-save-error"><p role="alert" className="form-error">{error}</p><button disabled={busy} onClick={()=>{reset();setRemoving(null);setReload(value=>value+1);}}>Reload latest accounts (discard edits)</button></section>}
  </>;
}
