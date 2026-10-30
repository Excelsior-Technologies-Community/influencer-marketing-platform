import {useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {api} from '../../services/api.js';

const roleForPath=path=>path.startsWith('/admin')?'SUPER_ADMIN':path.startsWith('/brand')?'BRAND_ADMIN':'CREATOR';
const reportPath=role=>role==='SUPER_ADMIN'?'/admin/analytics/reports':role==='BRAND_ADMIN'?'/brand/reports':'/creator/reports';
const reportTitle=role=>role==='SUPER_ADMIN'?'Platform financial report':role==='BRAND_ADMIN'?'Campaign financial report':'Creator earnings report';
const statuses=['DRAFT','PENDING_APPROVAL','APPROVED','LIVE','APPLICATION_CLOSED','IN_PROGRESS','CONTENT_SUBMITTED','UNDER_REVIEW','COMPLETED','REJECTED','PAUSED','CANCELLED','EXPIRED'];
const number=value=>Number(value||0).toLocaleString();
function money(value){const amount=BigInt(String(value||'0'));return `₹${(amount/100n).toLocaleString('en-IN')}.${String(amount%100n).padStart(2,'0')}`;}
async function errorText(error){let body=error.response?.data;if(body instanceof Blob){try{body=JSON.parse(await body.text());}catch{body=null;}}return body?.errors?.map(item=>item.message).join('. ')||body?.message||'Could not load the report.';}

export default function FinancialReports(){
  const location=useLocation(),role=roleForPath(location.pathname),endpoint=reportPath(role);
  const [filters,setFilters]=useState({from:'',to:'',status:'',campaignId:'',q:''});
  const [query,setQuery]=useState({...filters,page:1,pageSize:10});
  const [data,setData]=useState(null),[meta,setMeta]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[exporting,setExporting]=useState(false);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');const params=Object.fromEntries(Object.entries(query).filter(([,value])=>value!==''&&value!==undefined));
    api.get(endpoint,{params,signal:controller.signal}).then(response=>{setData(response.data.data.items);setMeta(response.data.meta);}).catch(async failure=>{if(!controller.signal.aborted)setError(await errorText(failure));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[endpoint,JSON.stringify(query)]);
  function apply(event){event.preventDefault();setQuery({...filters,page:1,pageSize:10});}
  async function exportCsv(){setExporting(true);setError('');try{const params=Object.fromEntries(Object.entries({...query,format:'csv',page:1}).filter(([,value])=>value!==''&&value!==undefined));const response=await api.get(endpoint,{params,responseType:'blob'});const url=URL.createObjectURL(response.data),link=document.createElement('a');link.href=url;link.download=`influencer-${role.toLowerCase()}-financial-report.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(failure){setError(await errorText(failure));}finally{setExporting(false);}}
  const isCreator=role==='CREATOR';
  return <div className="financial-reports"><div className="eyebrow">ANALYTICS & REPORTS</div><div className="admin-section-heading"><div><h1>{reportTitle(role)}.</h1><p>{isCreator?'Your released campaign earnings from the INR Test wallet.':'Posted campaign funding, Creator releases, platform commission and confirmed refunds.'}</p></div><button className="button" onClick={exportCsv} disabled={exporting||loading}>{exporting?'Preparing CSV…':'Export filtered CSV'}</button></div>
    <section className="admin-card"><p className="brand-helper">Amounts are INR minor units in the export and formatted as rupees below. Only posted test-wallet ledger activity is included. Reports are read-only and limited to 5,000 rows per export; use filters for larger date ranges.</p>
      <form className="admin-filters report-filters" onSubmit={apply}>
        <label>From date<input type="date" value={filters.from} onChange={event=>setFilters(old=>({...old,from:event.target.value}))}/></label>
        <label>To date<input type="date" value={filters.to} onChange={event=>setFilters(old=>({...old,to:event.target.value}))}/></label>
        {!isCreator&&<label>Campaign status<select value={filters.status} onChange={event=>setFilters(old=>({...old,status:event.target.value}))}><option value="">All statuses</option>{statuses.map(status=><option key={status}>{status}</option>)}</select></label>}
        <label>Campaign ID<input value={filters.campaignId} onChange={event=>setFilters(old=>({...old,campaignId:event.target.value.trim()}))} placeholder="Optional campaign UUID" maxLength={36}/></label>
        <label>Campaign or Creator<input value={filters.q} onChange={event=>setFilters(old=>({...old,q:event.target.value}))} placeholder="Search report rows" maxLength={100}/></label>
        <button className="button">Apply filters</button>
      </form>
      {error&&<p role="alert" className="form-error">{error}</p>}
      {loading?<p role="status">Loading report…</p>:!error&&<>
        <p role="status">{number(meta.total)} matching ledger rows</p>
        <div className="admin-table-wrap"><table><thead><tr><th>Date</th><th>Event</th><th>Campaign</th>{role!=='CREATOR'&&<th>Creator</th>}<th>Status</th><th>Gross</th><th>Commission</th><th>Creator net</th><th>Refunded</th></tr></thead><tbody>
          {data?.map(row=><tr key={row.rowId}><td>{row.reportDate?new Date(row.reportDate).toLocaleString():''}</td><td>{row.eventType.replaceAll('_',' ')}</td><td>{row.campaignTitle}<small className="report-campaign-id">{row.campaignId}</small></td>{role!=='CREATOR'&&<td>{row.creatorName||'—'}</td>}<td>{row.campaignStatus}</td><td>{money(row.grossMinor)}</td><td>{money(row.commissionMinor)}</td><td>{money(row.netMinor)}</td><td>{money(row.refundedMinor)}</td></tr>)}
        </tbody></table>{!data?.length&&<p className="admin-empty">No posted financial activity matches these filters.</p>}</div>
        <div className="report-pager"><span>Page {meta.page||1} of {Math.max(1,meta.totalPages||0)}</span><div><button disabled={loading||(meta.page||1)<=1} onClick={()=>setQuery(old=>({...old,page:old.page-1}))}>Previous</button><button disabled={loading||(meta.page||1)>=(meta.totalPages||1)} onClick={()=>setQuery(old=>({...old,page:old.page+1}))}>Next</button></div></div>
      </>}
    </section>
  </div>;
}
