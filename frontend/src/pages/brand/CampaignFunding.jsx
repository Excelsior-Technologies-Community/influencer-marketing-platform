import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {api} from '../../services/api.js';

let checkoutScript;
function loadCheckout(){
 if(window.Razorpay)return Promise.resolve();
 if(!checkoutScript)checkoutScript=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
  script.onload=()=>window.Razorpay?resolve():reject(new Error('Checkout unavailable'));
  script.onerror=()=>{script.remove();checkoutScript=null;reject(new Error('Checkout unavailable'));};document.head.appendChild(script);
 });
 return checkoutScript;
}
const labels={CREATING:'Preparing order',SETUP_REVIEW:'Order needs checking',PENDING:'Awaiting payment',SUCCEEDED:'Funded (test)'};
const message=e=>e.response?.data?.message||'Could not connect. Reload and try again.';
const date=v=>new Date(v).toLocaleString();
const amount=v=>{const cents=BigInt(v);return `${cents/100n}.${String(cents%100n).padStart(2,'0')}`;};
export default function CampaignFunding(){
 const {id}=useParams(),base=`/brand/campaigns/${id}/funding`;
 const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');setData(null);setConfirm(false);api.get(base,{signal:c.signal}).then(r=>setData(r.data.data)).catch(e=>{if(!c.signal.aborted)setError(message(e));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[base,reload]);
 async function check(){setBusy(true);setError('');try{const r=await api.post(`${base}/refresh`,{});setData(r.data.data);setNotice(r.data.data.funding?.status==='SUCCEEDED'?'Captured test payment confirmed.':'Payment status checked. Only captured payments count as funding.');}catch(e){setError(message(e));}finally{setBusy(false);}}
 async function pay(){
  setBusy(true);setConfirm(false);setError('');setNotice('');
  try{
   const r=await api.post(`${base}/order`,{revision:data.campaign.revision}),next=r.data.data;setData(next);
   if(!next.funding?.orderId||next.funding.status!=='PENDING'){setNotice('Order is being prepared or already funded. Check payment status.');setBusy(false);return;}
   if(!next.canFund){setBusy(false);return;}
   await loadCheckout();
   const checkout=new window.Razorpay({key:next.funding.keyId,amount:next.funding.amountMinor,currency:'INR',order_id:next.funding.orderId,name:'Influence — Test Mode',description:'Campaign funding (test funds only)',
    handler:async response=>{try{const v=await api.post(`${base}/verify`,response);setData(v.data.data);setNotice(v.data.data.funding.status==='SUCCEEDED'?'Captured test payment confirmed.':'Payment is awaiting capture. Check payment status shortly.');}catch(e){setError(message(e));}finally{setBusy(false);}},
    modal:{ondismiss:()=>{setBusy(false);setNotice('Checkout closed. If you attempted payment, check payment status before retrying.');}}
   });
   checkout.on('payment.failed',()=>{setNotice('Payment attempt failed. Check payment status to see the recorded result. You can retry the same order.');});checkout.open();
  }catch(e){setError(e.response?message(e):'Could not open Razorpay checkout. Check payment status before retrying.');setBusy(false);}
 }
 return <div className="campaign-management"><div className="eyebrow">BRAND / CAMPAIGN FUNDING</div><div className="brand-actions"><Link to={`/brand/campaigns/${id}/manage`}>← Manage campaign</Link><Link to="/brand/wallet">Wallet & payments ↗</Link><button disabled={busy} onClick={()=>setReload(x=>x+1)}>Reload funding</button></div><Link to={`/brand/campaigns/${id}/earnings-release`}>Creator earnings & commission ↗</Link><Link to={`/brand/campaigns/${id}/refunds`}>Refunds & payment review ↗</Link><h1>Fund your campaign.</h1><p className="creator-notice">Razorpay Test Mode · INR · Test funds only. No real money is collected.</p>{error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status" className="creator-notice">{notice}</p>}{loading?<p role="status">Loading campaign funding…</p>:data&&<><section className="admin-card"><h2>{data.campaign.title}</h2><p>Campaign: {data.campaign.status.replaceAll('_',' ')}</p><p>Saved campaign budget: <strong>{data.campaign.currency} {data.campaign.totalBudget??'Not set'}</strong></p><p>Funding covers the saved campaign budget as principal. Creator earnings and 10% commission can be released after campaign completion. Cancelled campaigns can request a full refund before earnings release; exceptions require payment review.</p>{!data.configuration.configured&&<p role="status">Test payments are not configured yet. The platform owner needs to finish the Razorpay Test Mode setup.</p>}{data.campaign.currency!=='INR'&&<p>This setup supports INR campaigns only.</p>}{!data.canFund&&data.funding?.status!=='SUCCEEDED'&&<p>Funding requires a configured test gateway and an approved or active INR campaign with a budget of at least ₹1. Orders that are still being prepared must be checked first.</p>}</section><section className="admin-card"><h2>Funding status</h2><p><strong>{data.funding?labels[data.funding.status]:'Not funded'}</strong></p>{data.funding&&<><p>Order amount: INR {amount(data.funding.amountMinor)}</p><p>Started: {date(data.funding.createdAt)}</p>{data.funding.orderId&&<p style={{overflowWrap:'anywhere'}}>Razorpay test order: {data.funding.orderId}</p>}{data.funding.status==='SUCCEEDED'&&<p>Captured payment confirmed by the server. This is campaign funding, not a Creator earnings balance or payout.</p>}</>}<div className="brand-actions">{data.canFund&&<button className="button" disabled={busy||confirm} onClick={()=>setConfirm(true)}>{data.funding?'Pay existing test order':'Fund campaign in test mode'}</button>}{data.funding&&data.configuration.configured&&<button disabled={busy} onClick={check}>{busy?'Checking…':'Check payment status'}</button>}</div>{confirm&&<div><h3>Open Razorpay Test Mode checkout?</h3><p>Fund INR {data.funding?amount(data.funding.amountMinor):data.campaign.totalBudget} for this campaign. The amount comes from the saved campaign budget. Use Razorpay test payment details.</p><div className="brand-actions"><button className="button" disabled={busy} onClick={pay}>Continue to test checkout</button><button disabled={busy} onClick={()=>setConfirm(false)}>Keep campaign unfunded</button></div></div>}</section><section className="admin-card"><h2>Payment attempts</h2><p>Only server-verified captured payments mark the campaign as funded. Failed attempts can retry the same order; closing checkout does not mark payment as failed.</p>{!data.attempts.length?<p>No verified payment attempts yet.</p>:data.attempts.map(a=><article key={a.paymentId}><h3>{a.status}</h3><p>INR {amount(a.amountMinor)} · {date(a.updatedAt)}</p><p style={{overflowWrap:'anywhere'}}>{a.paymentId}</p></article>)}{data.attempts.length===100&&<p>Showing the latest 100 payment attempts.</p>}</section></>}</div>;
}

