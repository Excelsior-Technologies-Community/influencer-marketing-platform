import { randomUUID } from 'node:crypto';
import { campaignRepository as repository } from '../repositories/campaign.repository.js';
const choice=row=>({...row,isAvailable:Boolean(row.isAvailable)});
function dto([rows,platforms,categories,contentTypes,deliverables]){return {...rows[0],platforms:platforms.map(choice),platformIds:platforms.map(row=>row.id),categories:categories.map(choice),categoryIds:categories.map(row=>row.id),contentTypes:contentTypes.map(choice),contentTypeIds:contentTypes.map(row=>row.id),deliverables};}
export const campaignService={
  get:async(actor,id)=>dto(await repository.get([actor,id])),
  async list(actor,query){const [items,counts]=await repository.list([actor,query.status||null,query.q||'',query.pageSize,(query.page-1)*query.pageSize]),total=Number(counts[0].total);return {items,meta:{...query,total,totalPages:Math.ceil(total/query.pageSize)}};},
  async catalogs(actor,campaignId){const [platforms,categories,contentTypes]=await repository.catalogs([actor,campaignId||null]);return {platforms:platforms.map(choice),categories:categories.map(choice),contentTypes:contentTypes.map(choice)};},
  async save(actor,id,input,requestId){const campaignId=id||randomUUID();const {title,description,totalBudget,currency,creatorSlots,requirements,revision,...links}=input;await repository.save([actor,campaignId,!id,title,description,totalBudget,currency,creatorSlots,requirements,JSON.stringify(links),revision??null,requestId]);return this.get(actor,campaignId);}
};
