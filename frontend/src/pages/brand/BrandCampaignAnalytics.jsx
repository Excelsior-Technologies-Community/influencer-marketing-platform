import { useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { api } from '../../services/api.js';
import { campaignStatuses } from '../../data/campaign-statuses.js';
import './BrandCampaignAnalytics.css';

const failureText=error=>error.response?.data?.message||'Could not load campaign analytics. Please try again.';
const money=(minor,currency='INR')=>minor===null||minor===undefined?'Not recorded':new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(minor)/100);
const budget=(amount,currency)=>amount===null?'Not set':new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(amount));

function Metric({label,value,note}){return <article><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</article>;}

function CampaignCard({campaign}){
  const spend=Number(campaign.releasedGrossMinor),budgetMinor=campaign.budgetMinor===null?null:Number(campaign.budgetMinor);
  const spentPercent=budgetMinor>0?Math.min(100,Math.round(spend/budgetMinor*100)):0;
  return <article className="admin-card campaign-analytics-card">
    <div className="admin-section-heading campaign-analytics-title"><div><div className="eyebrow">CAMPAIGN PERFORMANCE</div><h2>{campaign.title}</h2></div><span className="state-pill">{campaign.status.replaceAll('_',' ')}</span></div>
    <div className="admin-stats campaign-analytics-stats">
      <Metric label="Applications" value={campaign.applications}/>
      <Metric label="Approved creators" value={campaign.approvedCreators}/>
      <Metric label="Submitted deliverables" value={campaign.submittedDeliverables} note={`${campaign.approvedDeliverables} approved · ${campaign.requiredDeliverables} required`}/>
      <Metric label="Campaign budget" value={budget(campaign.budgetAmount,campaign.currency)}/>
      <Metric label="Captured funding (Test Mode)" value={campaign.currency!=='INR'?'Unavailable':campaign.fundedMinor===null?'Not funded':money(campaign.fundedMinor)}/>
      <Metric label="Released from campaign (INR)" value={campaign.currency!=='INR'?'Unavailable':money(campaign.releasedGrossMinor)} note="Gross release, including Creator payout and commission"/>
    </div>
    {campaign.currency==='INR'&&budgetMinor!==null&&<div className="campaign-spend-progress"><div><span>Budget released</span><strong>{spentPercent}%</strong></div><div className="creator-readiness-track" role="progressbar" aria-label={`${campaign.title} budget released`} aria-valuenow={spentPercent} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${spentPercent}%`}}/></div></div>}
    <details className="campaign-analytics-details"><summary>Payment breakdown and performance data</summary><div className="admin-stats campaign-analytics-stats">
      <Metric label="Creator wallets credited" value={money(campaign.creatorPayoutMinor)}/>
      <Metric label="Platform commission" value={money(campaign.commissionMinor)}/>
      <Metric label="Refunds processed" value={money(campaign.refundedMinor)}/>
      <Metric label="Funds still held" value={campaign.currency!=='INR'?'Unavailable':money(campaign.heldMinor)}/>
      <Metric label="Campaign reach" value="Not recorded"/>
      <Metric label="Impressions, views and engagement" value="Not recorded"/>
    </div><p className="brand-helper">Campaign post-level reach, impressions, views and engagement have no recorded data source yet. Creator profile metrics are self-reported and are not substituted for campaign performance. Payment figures are posted INR Test Mode ledger entries; a configured budget in another currency cannot be compared with INR payments.</p></details>
  </article>;
}

export default function BrandCampaignAnalytics(){
  const [params,setParams]=useSearchParams(),key=params.toString();
  const [q,setQ]=useState(params.get('q')||''),[status,setStatus]=useState(params.get('status')||'');
  const [data,setData]=useState(null),[meta,setMeta]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{setQ(params.get('q')||'');setStatus(params.get('status')||'');},[key]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    api.get('/brand/analytics/campaigns',{params:Object.fromEntries(params),signal:controller.signal}).then(result=>{setData(result.data.data.items);setMeta(result.data.meta);}).catch(failure=>{if(!controller.signal.aborted)setError(failureText(failure));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[key,reload]);
  function search(event){event.preventDefault();setParams({...q.trim()&&{q:q.trim()},...status&&{status}});}
  function page(value){const next=Object.fromEntries(params);if(value===1)delete next.page;else next.page=String(value);setParams(next);}
  return <div className="campaign-management">
    <div className="admin-section-heading"><div><p>Measure campaign workflow, content delivery and recorded payment activity.</p></div><button onClick={()=>setReload(value=>value+1)} disabled={loading}>Refresh analytics</button></div>
    <section className="admin-card"><form className="admin-filters" onSubmit={search}>
      <label>Search campaigns<input value={q} onChange={event=>setQ(event.target.value)} maxLength={100} placeholder="Campaign title"/></label>
      <label>Campaign status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">All statuses</option>{campaignStatuses.map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
      <button className="button">Apply filters</button><button type="button" onClick={()=>{setQ('');setStatus('');setParams({});}}>Clear</button>
    </form></section>
    {error&&<section className="admin-card"><p role="alert" className="form-error">{error}</p><button onClick={()=>setReload(value=>value+1)}>Retry</button></section>}
    {loading?<p role="status">Loading your campaign analytics…</p>:data&&<>
      {!data.length?<section className="admin-card"><h2>No campaigns found</h2><p>{meta.total?'No campaigns match these filters.':'Create a campaign to start tracking its activity.'}</p><Link className="button" to="/brand/campaigns">Open campaigns ↗</Link></section>:data.map(campaign=><CampaignCard key={campaign.id} campaign={campaign}/>)}
      <div className="admin-pagination"><span>{meta.total} campaigns · Page {meta.page} of {Math.max(1,meta.totalPages)}</span><button disabled={meta.page<=1||loading} onClick={()=>page(meta.page-1)}>Previous</button><button disabled={meta.page>=meta.totalPages||loading} onClick={()=>page(meta.page+1)}>Next</button></div>
    </>}
  </div>;
}
