import { randomUUID } from 'node:crypto';
import { callProcedure,callProcedureSets } from '../repositories/procedure.repository.js';
import { ApiError } from '../utils/api-error.js';
const domains={INSTAGRAM:['instagram.com'],FACEBOOK:['facebook.com'],YOUTUBE:['youtube.com']};
function checkPlatformUrl(code,url){
  const host=new URL(url).hostname.toLowerCase(),allowed=domains[code];
  if(allowed&&!allowed.some(domain=>host===domain||host.endsWith(`.${domain}`)))throw new ApiError(422,'Profile URL must match the selected platform');
}
export const accountDto=row=>({...row,isAvailable:Boolean(row.isAvailable),isVerified:false,followersCount:row.followersCount===null?null:Number(row.followersCount),averageViews:row.averageViews===null?null:Number(row.averageViews),engagementRate:row.engagementRate===null?null:Number(row.engagementRate)});
export const creatorSocialService={
  async list(actor){const [items,platforms]=await callProcedureSets('sp_get_creator_social_accounts',[actor]);return {items:items.map(accountDto),platforms:platforms.map(row=>({...row,isAvailable:Boolean(row.isAvailable)}))};},
  async save(actor,id,input,requestId){
    const current=await this.list(actor),existing=id?current.items.find(row=>row.id===id):null;
    if(id&&!existing)throw new ApiError(404,'Social account not found');
    const platform=current.platforms.find(row=>row.id===(existing?.platformId||input.platformId));
    if(!platform||(!existing&&!platform.isAvailable))throw new ApiError(422,'Choose an available social platform');
    checkPlatformUrl(platform.code,input.profileUrl);
    const accountId=id||randomUUID();
    await callProcedure('sp_save_creator_social_account',[actor,accountId,!id,platform.id,input.username,input.profileUrl,input.followersCount,input.averageViews,input.engagementRate,input.revision||null,requestId]);
    return this.list(actor);
  },
  async remove(actor,id,revision,requestId){await callProcedure('sp_delete_creator_social_account',[actor,id,revision,requestId]);return this.list(actor);}
};
