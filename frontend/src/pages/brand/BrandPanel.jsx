import { useEffect,useState } from 'react';
import { NavLink,useLocation } from 'react-router-dom';
import { api } from '../../services/api.js';
import BrandCampaignAnalytics from './BrandCampaignAnalytics.jsx';
import FinancialReports from '../analytics/FinancialReports.jsx';
import './BrandProfile.css';
const sections=[['','Overview'],['profile','Company profile'],['billing','Billing details'],['analytics','Campaign analytics'],['reports','Financial reports']];
const errorText=error=>error.response?.data?.errors?.map(item=>`${item.field}: ${item.message}`).join('. ')||error.response?.data?.message||'Could not connect. Please try again.';
function writable(profile){return {revision:profile.revision,companyName:profile.companyName,website:profile.website,industry:profile.industry,description:profile.description,contactName:profile.contactName,contactEmail:profile.contactEmail,phone:profile.phone,location:profile.location,socialLinks:profile.socialLinks,billing:profile.billing};}
function LogoImage({profile}){
  const [url,setUrl]=useState(''),[error,setError]=useState('');
  const hash=profile.logo?.hash;
  useEffect(()=>{let objectUrl;const controller=new AbortController();setUrl('');setError('');
    if(hash)api.get('/brand/profile/logo',{responseType:'blob',signal:controller.signal}).then(result=>{if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(result.data);setUrl(objectUrl);}).catch(failure=>{if(!controller.signal.aborted)setError('Could not load the company logo.');});
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[hash]);
  return <div className="brand-logo-display">{url?<img src={url} alt={`${profile.companyName} logo`}/>:<span aria-label="Company initials">{profile.companyName.trim().slice(0,2).toUpperCase()}</span>}{error&&<small role="alert">{error}</small>}</div>;
}
function Field({label,name,value,onChange,type='text',maxLength=240,required=false,minLength}){
  return <label>{label}<input name={name} value={value||''} onChange={event=>onChange(name,event.target.value)} type={type} maxLength={maxLength} required={required} minLength={minLength}/></label>;
}
function LogoEditor({profile,onProfile,onReload}){
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function change(remove=false){setError('');setMessage('');if(!remove&&!file){setError('Choose a logo image first.');return;}if(!remove&&file.size>2*1024*1024){setError('Logo must be 2 MiB or smaller.');return;}setBusy(true);
    try {let result;if(remove)result=await api.delete('/brand/profile/logo',{data:{revision:profile.logoRevision}});else{const body=new FormData();body.append('revision',String(profile.logoRevision));body.append('logo',file);result=await api.post('/brand/profile/logo',body);}onProfile(result.data.data.profile,remove?'Company logo removed.':'Company logo saved.');}
    catch(failure){setError(errorText(failure));}finally{setBusy(false);}
  }
  return <section className="admin-card brand-logo-editor"><div className="brand-logo-preview-wrap"><LogoImage profile={profile}/><span>BRAND MARK</span></div><div className="brand-logo-content"><div className="brand-profile-kicker">VISUAL IDENTITY</div><h3>Company logo</h3><p>Upload a clear logo so Creators can recognize your Brand in campaign listings and workspaces.</p><label className="brand-logo-file-label">Choose company logo<input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={event=>setFile(event.target.files?.[0]||null)}/><small>PNG, JPEG or WebP · up to 2 MiB</small></label><div className="brand-actions"><button className="button" disabled={busy} onClick={()=>change(false)}>{busy?'Please wait…':'Upload logo'}</button>{profile.logo&&<button disabled={busy} onClick={()=>change(true)}>Remove logo</button>}</div>{error&&<><p role="alert" className="form-error">{error}</p><button onClick={onReload}>Reload latest profile</button></>}{message&&<p role="status" className="form-success">{message}</p>}</div></section>;
}
function CompanyProfile({profile,onProfile,onReload}){
  const [form,setForm]=useState(writable(profile)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const change=(name,value)=>setForm(old=>({...old,[name]:value}));
  async function save(event){event.preventDefault();setError('');setMessage('');setBusy(true);try{const result=await api.put('/brand/profile',{...form,revision:profile.revision});onProfile(result.data.data.profile,'Company profile saved.');}catch(failure){setError(errorText(failure));}finally{setBusy(false);}}
  return <div className="brand-profile-editor"><LogoEditor profile={profile} onProfile={onProfile} onReload={onReload}/><section className="admin-card brand-company-profile"><div className="brand-profile-heading"><span className="brand-profile-number">01</span><div><div className="brand-profile-kicker">YOUR BRAND IDENTITY</div><h2>Company information</h2><p>Complete these details so Creators know who they’ll be working with.</p></div></div><form className="brand-form" onSubmit={save}>
    <Field label="Company name" name="companyName" value={form.companyName} onChange={change} maxLength={160} minLength={2} required/>
    <Field label="Industry" name="industry" value={form.industry} onChange={change} maxLength={120}/>
    <Field label="Website" name="website" value={form.website} onChange={change} type="url" maxLength={2048}/>
    <Field label="Location" name="location" value={form.location} onChange={change}/>
    <Field label="Contact name" name="contactName" value={form.contactName} onChange={change} maxLength={120}/>
    <Field label="Contact email" name="contactEmail" value={form.contactEmail} onChange={change} type="email" maxLength={254}/>
    <Field label="Phone" name="phone" value={form.phone} onChange={change} type="tel" maxLength={32}/>
    <label className="full-width">Company description<textarea name="description" value={form.description||''} onChange={event=>change('description',event.target.value)} maxLength={5000} rows={5}/></label>
    <h3 className="full-width brand-profile-section-title">Social links</h3><p className="full-width brand-profile-section-note">Add official public profiles to help Creators verify they’re viewing the right Brand.</p>{['instagram','facebook','youtube'].map(platform=><Field key={platform} label={`${{instagram:'Instagram',facebook:'Facebook',youtube:'YouTube'}[platform]} URL`} name={platform} value={form.socialLinks[platform]} type="url" maxLength={2048} onChange={(name,value)=>setForm(old=>({...old,socialLinks:{...old.socialLinks,[name]:value}}))}/>)}
    {error&&<div className="full-width"><p role="alert" className="form-error">{error}</p><button type="button" onClick={onReload}>Reload latest profile (discard changes)</button></div>}{message&&<p role="status" className="form-success full-width">{message}</p>}
    <div className="full-width brand-actions"><button className="button" disabled={busy}>{busy?'Saving…':'Save company profile'}</button></div>
  </form></section></div>;
}
function BillingProfile({profile,onProfile,onReload}){
  const [billing,setBilling]=useState(profile.billing),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const change=(name,value)=>setBilling(old=>({...old,[name]:value}));
  async function save(event){event.preventDefault();setBusy(true);setError('');setMessage('');try{const result=await api.put('/brand/profile',{...writable(profile),billing});onProfile(result.data.data.profile,'Billing details saved.');}catch(failure){setError(errorText(failure));}finally{setBusy(false);}}
  return <section className="admin-card"><h2>Billing details</h2><p className="brand-helper">Save the company details to use for future billing.</p><form className="brand-form" onSubmit={save}>
    <Field label="Billing name" name="name" value={billing.name} onChange={change} maxLength={160}/><Field label="Billing email" name="email" value={billing.email} onChange={change} type="email" maxLength={254}/>
    <Field label="Tax or GST identifier" name="taxId" value={billing.taxId} onChange={change} maxLength={64}/><Field label="Country" name="country" value={billing.country} onChange={change} maxLength={120}/>
    <Field label="Address line 1" name="addressLine1" value={billing.addressLine1} onChange={change}/><Field label="Address line 2" name="addressLine2" value={billing.addressLine2} onChange={change}/>
    <Field label="City" name="city" value={billing.city} onChange={change} maxLength={120}/><Field label="State or region" name="state" value={billing.state} onChange={change} maxLength={120}/><Field label="Postal code" name="postalCode" value={billing.postalCode} onChange={change} maxLength={32}/>
    {error&&<div className="full-width"><p role="alert" className="form-error">{error}</p><button type="button" onClick={onReload}>Reload latest profile (discard changes)</button></div>}{message&&<p role="status" className="form-success full-width">{message}</p>}<div className="full-width brand-actions"><button className="button" disabled={busy}>{busy?'Saving…':'Save billing details'}</button></div>
  </form></section>;
}
function Overview({data}){
  const profile=data.profile,ready=data.readiness,stats=data.campaigns;
  return <><section className="brand-welcome admin-card"><LogoImage profile={profile}/><div><div className="eyebrow">YOUR COMPANY</div><h2>{profile.companyName}</h2><p>{profile.industry||'Add your industry'} · {profile.location||'Add your location'}</p><span className="state-pill active">{profile.status}</span></div><NavLink className="button" to="/brand/profile">Edit company profile ↗</NavLink></section><div className="admin-stats"><article><span>Profile readiness</span><strong>{ready.percent}%</strong><small>{ready.completed} of {ready.total} company details provided</small></article><article><span>Billing details</span><strong className="brand-status-text">{ready.billingReady?'Ready':'To complete'}</strong><small>Company contact and billing address</small></article><article><span>Account status</span><strong className="brand-status-text">Active</strong><small>{profile.accountEmail}</small></article></div><section className="admin-card"><div className="admin-section-heading"><div><h2>Your campaign activity</h2><p>Live counts from campaigns and applications belonging to your company.</p></div><NavLink to="/brand/campaigns">Manage campaigns ↗</NavLink></div><div className="admin-stats"><article><span>Total campaigns</span><strong>{stats.totalCampaigns}</strong></article><article><span>Live campaigns</span><strong>{stats.liveCampaigns}</strong></article><article><span>Campaigns awaiting review</span><strong>{stats.campaignsAwaitingReview}</strong></article><article><span>Active campaigns</span><strong>{stats.activeCampaigns}</strong></article><article><span>Completed campaigns</span><strong>{stats.completedCampaigns}</strong></article><article><span>Applications to review</span><strong>{stats.applicationsAwaitingDecision}</strong></article><article><span>Approved creators</span><strong>{stats.approvedCreators}</strong></article></div><NavLink className="brand-billing-link" to="/brand/analytics">View campaign analytics ↗</NavLink></section><section className="admin-card"><h3>Your next steps</h3>{ready.missing.length?<><p className="brand-helper">Add these details to complete your company profile.</p><ul className="brand-checklist">{ready.missing.map(item=><li key={item.key}><NavLink to="/brand/profile">{item.label} ↗</NavLink></li>)}</ul></>:<p className="form-success">Your company profile is complete.</p>}{!ready.billingReady&&<NavLink className="brand-billing-link" to="/brand/billing">Complete billing details ↗</NavLink>}</section><section className="admin-card"><h3>Campaign workspace</h3><p className="brand-helper">Plan campaign drafts, submit them for approval and track reviewer feedback.</p><NavLink className="button" to="/brand/campaigns">Open campaigns ↗</NavLink></section></>;
}
export default function BrandPanel(){
  const section=useLocation().pathname.split('/')[2]||'';
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[notice,setNotice]=useState('');
  useEffect(()=>{setNotice('');},[section]);
  useEffect(()=>{if(['analytics','reports'].includes(section)){setLoading(false);return;}const controller=new AbortController();setLoading(true);setError('');api.get('/brand/dashboard',{signal:controller.signal}).then(result=>setData(result.data.data)).catch(failure=>{if(!controller.signal.aborted)setError(errorText(failure));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[reload,section]);
  async function saved(profile,message){setData(old=>({...old,profile}));setNotice(message);try{const result=await api.get('/brand/dashboard');setData(result.data.data);}catch(failure){setError(errorText(failure));}}
  const title=sections.find(([path])=>path===section)?.[1]||'Brand workspace';
  if(section==='reports')return <><div className="eyebrow">BRAND WORKSPACE</div><h1>Financial reports</h1><nav className="admin-tabs" aria-label="Brand sections">{sections.map(([path,label])=><NavLink key={path} to={`/brand${path?`/${path}`:''}`} end>{label}</NavLink>)}</nav><FinancialReports/></>;
  if(section==='analytics')return <><div className="eyebrow">BRAND WORKSPACE</div><h1>Campaign analytics</h1><nav className="admin-tabs" aria-label="Brand sections">{sections.map(([path,label])=><NavLink key={path} to={`/brand${path?`/${path}`:''}`} end>{label}</NavLink>)}</nav><BrandCampaignAnalytics/></>;
  return <><div className="eyebrow">BRAND WORKSPACE</div><h1>{title}</h1><nav className="admin-tabs" aria-label="Brand sections">{sections.map(([path,label])=><NavLink key={path} to={`/brand${path?`/${path}`:''}`} end>{label}</NavLink>)}</nav>{notice&&<p role="status" className="form-success">{notice}</p>}{loading?<p role="status">Loading your brand workspace…</p>:error?<section className="admin-card"><p role="alert" className="form-error">{error}</p><button onClick={()=>setReload(value=>value+1)}>Retry</button></section>:data?section===''?<Overview data={data}/>:section==='profile'?<CompanyProfile key={`${data.profile.id}-${data.profile.revision}`} profile={data.profile} onProfile={saved} onReload={()=>setReload(value=>value+1)}/>:section==='billing'?<BillingProfile key={`${data.profile.id}-${data.profile.revision}`} profile={data.profile} onProfile={saved} onReload={()=>setReload(value=>value+1)}/>:<p>Brand page not found.</p>:null}</>;
}
