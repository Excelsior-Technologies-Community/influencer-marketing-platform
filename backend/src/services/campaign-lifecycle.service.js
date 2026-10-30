import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
const cancellable=['DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','LIVE','PAUSED','APPLICATION_CLOSED','IN_PROGRESS'];
export const lifecycleService={
 async get(actor,id,admin=false){const [rows,history]=await callProcedureSets('sp_get_campaign_lifecycle',[actor,id]);const campaign=rows[0],actions=[];if(!admin){if(campaign.status==='APPROVED')actions.push('PUBLISH');if(campaign.status==='LIVE')actions.push('PAUSE');if(campaign.status==='PAUSED')actions.push('RESUME');}if(cancellable.includes(campaign.status))actions.push('CANCEL');return {campaign:{...campaign,canDelete:!admin&&Boolean(campaign.canDelete)},actions,history};},
 async change(actor,id,input,requestId,admin=false){await callProcedure('sp_change_campaign_status',[actor,id,input.action,input.revision,input.reason,requestId]);return this.get(actor,id,admin);},
 async refresh(actor,id,requestId,admin=false){await callProcedure('sp_refresh_campaign_status',[actor,id,requestId]);return this.get(actor,id,admin);},
 async remove(actor,id,revision,requestId){await callProcedure('sp_delete_campaign',[actor,id,revision,requestId]);return {deleted:true,id};}
};
