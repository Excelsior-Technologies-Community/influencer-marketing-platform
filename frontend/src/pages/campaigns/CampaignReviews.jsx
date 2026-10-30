import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {api} from '../../services/api.js';
import {useAuth} from '../../store/auth-context.js';

const date=value=>value?new Date(value).toLocaleString():'Date unavailable';

export default function CampaignReviews(){
 const {id}=useParams(),{user}=useAuth(),base=user?.role==='BRAND_ADMIN'?'/brand':'/creator';
 const [data,setData]=useState(null),[ratings,setRatings]=useState({}),[comments,setComments]=useState({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setData(null);
  api.get(`${base}/workspaces/${id}/reviews`,{signal:controller.signal}).then(r=>setData(r.data.data)).catch(e=>{if(!controller.signal.aborted)setError(e.response?.data?.message||'Could not load campaign reviews.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[base,id,reload]);
 async function submit(target){
  setBusy(target.userId);setError('');setNotice('');
  try{
   await api.post(`${base}/workspaces/${id}/reviews`,{revieweeUserId:target.userId,rating:Number(ratings[target.userId]),comment:(comments[target.userId]||'').trim()});
   setNotice(`Your review for ${target.name} was submitted.`);setReload(value=>value+1);
  }catch(e){setError(e.response?.data?.message||'Could not save the review. Reload the page to check its status.');}
  finally{setBusy('');}
 }
 const completed=data?.campaign?.status==='COMPLETED';
 return <div className="campaign-management">
  <div className="eyebrow">CAMPAIGN / REVIEWS</div>
  <div className="brand-actions"><Link to={`${base}/workspaces/${id}`}>← Campaign workspace</Link><button disabled={Boolean(busy)} onClick={()=>setReload(value=>value+1)}>Reload reviews</button></div>
  <h1>Campaign reviews.</h1>
  {notice&&<p className="creator-notice" role="status">{notice}</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {loading?<p role="status">Loading campaign reviews…</p>:data&&<>
   <section className="admin-card"><h2>{data.campaign.title}</h2><p>Campaign status: {data.campaign.status.replaceAll('_',' ')}</p><p>Reviews are available after campaign completion. Reviews are attributed and visible only to their author and recipient. A submitted review cannot be edited or removed.</p></section>
   {completed&&<section className="admin-card"><h2>Review your campaign participants</h2>
    {!data.targets.length?<p>No approved participants are available for review.</p>:data.targets.map(target=><article key={target.userId}>
     <h3>{target.name} <span className="state-pill">{target.role.replaceAll('_',' ')}</span></h3>
     {target.alreadyReviewed?<p role="status">You have already submitted your review for this participant.</p>:<form className="content-submission-form" onSubmit={event=>{event.preventDefault();submit(target);}}>
      <fieldset disabled={Boolean(busy)}><label>Rating<select required value={ratings[target.userId]||''} onChange={event=>setRatings({...ratings,[target.userId]:event.target.value})}><option value="">Choose a rating</option>{[5,4,3,2,1].map(value=><option key={value} value={value}>{value} / 5</option>)}</select></label>
       <label>Comment (optional)<textarea rows={3} maxLength={1000} value={comments[target.userId]||''} onChange={event=>setComments({...comments,[target.userId]:event.target.value})} placeholder="Share brief, respectful feedback"/></label>
       <button className="button" disabled={!ratings[target.userId]}>{busy===target.userId?'Submitting…':'Submit review'}</button>
      </fieldset>
     </form>}
    </article>)}
   </section>}
   <section className="admin-card"><h2>Reviews visible to you</h2>
    {!data.reviews.length?<p>No reviews have been shared with you yet.</p>:data.reviews.map(review=><article key={review.id}><div className="admin-section-heading"><h3>{review.direction==='GIVEN'?`You reviewed ${review.revieweeName}`:`${review.reviewerName} reviewed you`}</h3><span className="state-pill">{review.rating} / 5</span></div>{review.comment&&<p style={{whiteSpace:'pre-wrap'}}>{review.comment}</p>}<p className="brand-helper">{date(review.createdAt)} · {review.direction==='GIVEN'?'Submitted by you':'Received'}</p></article>)}
   </section>
  </>}
 </div>;
}
