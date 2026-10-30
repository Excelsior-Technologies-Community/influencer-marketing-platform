import {campaignStatuses} from '../validators/campaign-lifecycle.validator.js';
const reply=(description,ok=true)=>({description,content:{'application/json':{schema:{$ref:`#/components/schemas/${ok?'Success':'Error'}`}}}});
const rev={type:'integer',minimum:1,maximum:2147483646};
const path={in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}};
function op(summary,{body=null,list=false,file=false}={}) {
 const result={
  tags:['Campaign approval'],summary,security:[{bearerAuth:[]}],
  description:'Active owning Brand or Super Admin only. DRAFT -> PENDING_APPROVAL -> APPROVED/REJECTED; REJECTED -> DRAFT. Submission/approval atomically revalidate saved details, active catalogs, brief, ordered dates, future deadlines and active Brand. Pending/decided campaigns are locked. History stores decisions/reasons, not content snapshots. Admin files are private and audited. Approval never publishes; use campaign lifecycle management for publication and later status actions.',
  parameters:[...(!list?[path]:[]),...(file?[{in:'path',name:'fileId',required:true,schema:{type:'string',format:'uuid'}}]:[])],
  responses:{200:file?{description:'Private sandboxed no-store PDF/WebP attachment',content:{'application/pdf':{schema:{type:'string',format:'binary'}},'image/webp':{schema:{type:'string',format:'binary'}}}}:reply(list?'data.items and pagination meta':'data.campaign, platforms, categories, contentTypes, deliverables, files and history'),401:reply('Unauthenticated/inactive actor',false),403:reply('Role/origin denied',false),404:reply('Missing, foreign or unsubmitted draft',false),409:reply('Stale revision or invalid transition',false),422:reply('Invalid fields or not ready',false)}
 };
 if(list) result.parameters.push({in:'query',name:'status',schema:{type:'string',enum:campaignStatuses}},{in:'query',name:'page',schema:{type:'integer',minimum:1,maximum:100000,default:1}},{in:'query',name:'pageSize',schema:{type:'integer',minimum:1,maximum:50,default:10}});
 if(body) {
  result.parameters.push({in:'header',name:'X-Requested-With',required:true,schema:{type:'string',enum:['InfluenceWeb']}});
  const properties={revision:rev},required=['revision'];
  if(body==='submit'){properties.scheduleRevision={...rev,minimum:0};required.push('scheduleRevision');}
  if(body==='decision'){properties.decision={type:'string',enum:['APPROVE','REJECT']};properties.reason={type:'string',minLength:10,maxLength:1000};required.push('decision','reason');}
  result.requestBody={required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required,properties}}}};
 }
 return result;
}
export const reviewPaths={
 '/brand/campaigns/{id}/review':{get:op('Read owned saved campaign and review history')},
 '/brand/campaigns/{id}/submit':{post:op('Submit saved draft for Super Admin approval',{body:'submit'})},
 '/brand/campaigns/{id}/revise':{post:op('Return rejected campaign to draft',{body:'revise'})},
 '/admin/campaign-reviews':{get:op('List submitted and reviewed campaigns',{list:true})},
 '/admin/campaign-reviews/{id}':{get:op('Read campaign review details, schedule, files and history')},
 '/admin/campaign-reviews/{id}/decision':{post:op('Approve or reject pending campaign with reason',{body:'decision'})},
 '/admin/campaign-reviews/{id}/files/{fileId}':{get:op('Download private campaign review file with access audit',{file:true})}
};
