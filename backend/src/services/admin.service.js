import { adminRepository as repository } from '../repositories/admin.repository.js';
import { ApiError } from '../utils/api-error.js';
const escapeSearch = value=>value.replace(/[=%_]/g,character=>`=${character}`);
const offset=query=>(query.page-1)*query.pageSize;
const catalogDto = row=>({...row,isActive:Boolean(row.isActive)});
function listResult(sets,query,map=value=>value) {
  const [items,counts]=sets,total=Number(counts[0].total);
  return {items:items.map(map),meta:{page:query.page,pageSize:query.pageSize,total,totalPages:Math.ceil(total/query.pageSize)}};
}
async function one(rows) { if (!rows.length) throw new ApiError(404,'Record not found'); return rows[0]; }
export const adminService = {
  async dashboard(actor) { return repository.dashboard(actor); },
  async accounts(kind,query) {
    const params=[escapeSearch(query.q),query.status||null];
    if(kind==='creators')params.push(query.verification||null);
    params.push(query.pageSize,offset(query));
    return listResult(await repository.accounts(kind,params),query);
  },
  account:async(kind,id)=>one(await repository.account(kind,id)),
  changeStatus:async(actor,kind,id,input,requestId)=>one(await repository.changeStatus([actor,kind,id,input.status,input.reason,requestId])),
  verify:async(actor,id,input,requestId)=>one(await repository.verify([actor,id,input.status,input.reason,requestId])),
  catalogs:async(kind,query)=>listResult(await repository.catalogs([kind,escapeSearch(query.q),query.active===undefined?null:query.active==='true'?1:0,query.pageSize,offset(query)]),query,catalogDto),
  async saveCatalog(actor,kind,id,input,requestId) {
    const [result]=await repository.saveCatalog([actor,kind,id,input.name,input.code||null,input.parentId||null,input.isActive,input.reason||'Created by administrator',requestId]);
    return catalogDto(await one(await repository.catalog([kind,result.id])));
  },
  audit:async(query)=>listResult(await repository.audit([query.action||null,query.entityType||null,query.entityId||null,query.from?new Date(`${query.from}T00:00:00Z`):null,query.to?new Date(new Date(`${query.to}T00:00:00Z`).getTime()+86400000):null,query.pageSize,offset(query)]),query)
};
