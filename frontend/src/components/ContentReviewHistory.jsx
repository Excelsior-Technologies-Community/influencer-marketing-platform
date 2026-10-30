export default function ContentReviewHistory({reviews=[]}){
 return <section className="admin-card"><h2>Brand feedback</h2>{reviews.length?reviews.map(r=><article key={r.id}><h3>{r.toStatus.replaceAll('_',' ')} · Content version {r.version}</h3><p>{new Date(r.createdAt).toLocaleString()}</p><p style={{whiteSpace:'pre-wrap'}}>{r.reason}</p></article>):<p>No Brand decision recorded yet.</p>}</section>;
}
