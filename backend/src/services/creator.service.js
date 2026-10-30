import { creatorRepository as repository } from '../repositories/creator.repository.js';
import { ApiError } from '../utils/api-error.js';
export function profileDto([rows,categories]){
  if(!rows.length)throw new ApiError(404,'Creator profile not found');
  const row=rows[0],details=row.details||{};
  return {id:row.id,userId:row.userId,name:row.name,email:row.email,status:row.status,verificationStatus:row.verificationStatus,bio:row.bio,location:row.location,languages:details.languages||[],skills:details.skills||[],categories:categories.map(category=>({...category,isAvailable:Boolean(category.isAvailable)})),categoryIds:categories.map(category=>category.id),revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt};
}
export const creatorService={
  profile:async actor=>profileDto(await repository.get(actor)),
  update:async(actor,input,requestId)=>profileDto(await repository.update([actor,input.bio,input.location,JSON.stringify({languages:input.languages,skills:input.skills}),JSON.stringify(input.categoryIds),input.revision,requestId])),
  async categories(actor,query){
    const [items,count]=await repository.categories([actor,query.q.replace(/[=%_]/g,value=>`=${value}`),query.pageSize,(query.page-1)*query.pageSize]);
    const total=Number(count[0].total);
    return {items:items.map(item=>({...item,isAvailable:Boolean(item.isAvailable),isSelected:Boolean(item.isSelected)})),meta:{page:query.page,pageSize:query.pageSize,total,totalPages:Math.ceil(total/query.pageSize)}};
  }
};
