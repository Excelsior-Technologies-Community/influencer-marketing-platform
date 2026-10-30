import {randomUUID} from 'node:crypto';
import {callProcedure} from '../repositories/procedure.repository.js';
// Bound batches, per-campaign transactions and shared locks make multiple instances safe.
export async function refreshDueCampaigns(){
 const rows=await callProcedure('sp_due_campaign_statuses');let failed=false;
 for(const row of rows){try{await callProcedure('sp_refresh_campaign_status',[null,row.id,randomUUID()]);}catch(error){if(error.sqlMessage!=='CAMPAIGN_NOT_FOUND')failed=true;}}
 if(failed)throw new Error('Some campaign schedule refreshes failed');
 return rows.length;
}
export function startCampaignClock(){let running=false,stopped=false,pending=Promise.resolve();const tick=()=>{if(running||stopped)return;running=true;pending=refreshDueCampaigns().catch(()=>console.error(JSON.stringify({event:'campaign_clock_failed'}))).finally(()=>{running=false;});};const timer=setInterval(tick,60000);timer.unref();tick();return async()=>{stopped=true;clearInterval(timer);await pending;};}
