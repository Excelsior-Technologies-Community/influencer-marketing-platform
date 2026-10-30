import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {api} from '../../services/api.js';
import CampaignPreparation from './CampaignPreparation.jsx';
export default function CampaignPreparationPage(){
  const {id}=useParams(),[campaign,setCampaign]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');api.get(`/brand/campaigns/${id}`,{signal:controller.signal}).then(result=>setCampaign(result.data.data.campaign)).catch(failure=>{if(!controller.signal.aborted)setError(failure.response?.data?.message||'Could not load this campaign.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[id,reload]);
  return <><div className="eyebrow">BRAND / CAMPAIGN PREPARATION</div><Link className="brand-billing-link" to={`/brand/campaigns/${id}`}>← Campaign details</Link><h1>Schedule & campaign files.</h1>{loading?<p role="status">Loading campaign…</p>:error?<section className="admin-card"><p role="alert" className="form-error">{error}</p><button onClick={()=>setReload(value=>value+1)}>Retry campaign</button></section>:campaign&&<><p className="lead">{campaign.title}</p><CampaignPreparation campaignId={id} campaignRevision={campaign.revision}/></>}</>;
}
