import {randomUUID} from 'node:crypto';
import {preparationRepository as repository} from '../repositories/campaign-preparation.repository.js';
import {campaignService} from './campaign.service.js';
import {validateCreatorFile as validateFile} from './creator-file-validation.js';
import {scheduleFields} from '../validators/campaign-preparation.validator.js';
import {ApiError} from '../utils/api-error.js';
export function campaignReadiness(campaign,preparation,now=Date.now()){
  const schedule=preparation.schedule,dates=scheduleFields.map(key=>schedule[key]?new Date(schedule[key]).getTime():null),[open,apply,start,content,end]=dates;
  const check=(key,label,complete)=>({key,label,complete:Boolean(complete)});
  const checks=[check('draft','Campaign is a draft',campaign.status==='DRAFT'),check('description','Campaign description',campaign.description?.trim()),check('budget','Positive total budget and currency',campaign.totalBudget!==null&&Number(campaign.totalBudget)>0&&campaign.currency),check('slots','Valid creator slots',Number.isInteger(campaign.creatorSlots)&&campaign.creatorSlots>=1&&campaign.creatorSlots<=10000),check('requirements','Creator requirements',campaign.requirements?.trim()),check('platforms','Active platforms',campaign.platforms.length&&campaign.platforms.every(row=>row.isAvailable)),check('categories','Active categories',campaign.categories.length&&campaign.categories.every(row=>row.isAvailable)),check('contentTypes','Active content types',campaign.contentTypes.length&&campaign.contentTypes.every(row=>row.isAvailable)),check('deliverables','Valid deliverables',campaign.deliverables.length&&campaign.deliverables.every(row=>row.quantity>=1&&row.quantity<=100&&campaign.platformIds.includes(row.platformId)&&campaign.contentTypeIds.includes(row.contentTypeId))),check('schedule','Complete schedule in date order',dates.every(date=>date!==null)&&open<apply&&apply<=start&&start<content&&content<=end),check('future','Application deadline and campaign start are in the future',apply!==null&&start!==null&&apply>now&&start>now),check('brief','Campaign brief uploaded',preparation.files.some(row=>row.kind==='BRIEF'))];
  const missing=checks.filter(row=>!row.complete);return {ready:missing.length===0,checks,missing,checkedAt:new Date(now).toISOString(),note:'Checks use saved data. This does not submit, approve or publish the campaign.'};
}
export const campaignPreparationService={
  async get(actor,id){const [rows,files]=await repository.get([actor,id]);const {status,...schedule}=rows[0];return {status,schedule,files};},
  async saveSchedule(actor,id,input,requestId){await repository.schedule([actor,id,...scheduleFields.map(key=>input[key]===null?null:new Date(input[key])),input.revision,requestId]);return this.get(actor,id);},
  async readiness(actor,id){const [campaign,preparation]=await Promise.all([campaignService.get(actor,id),this.get(actor,id)]);return campaignReadiness(campaign,preparation);},
  async saveFile(actor,id,fileId,input,file,requestId){const current=await this.get(actor,id);const existing=fileId?current.files.find(row=>row.id===fileId):null;if(fileId&&!existing)throw new ApiError(404,'Campaign file not found');if(current.status!=='DRAFT')throw new ApiError(409,'Only draft campaigns can be changed');const output=await validateFile(file,'PORTFOLIO');await repository.saveFile([actor,id,fileId||randomUUID(),existing?.kind||input.kind,input.title,output.bytes,output.mimeType,output.hash,output.width,output.height,output.pageCount,input.revision??null,requestId]);return this.get(actor,id);},
  async file(actor,id,fileId){const rows=await repository.file([actor,id,fileId]);if(!rows.length)throw new ApiError(404,'Campaign file not found');return rows[0];},
  async removeFile(actor,id,fileId,revision,requestId){await repository.removeFile([actor,id,fileId,revision,requestId]);return this.get(actor,id);}
};
