import {campaignStatuses} from '../validators/campaign-lifecycle.validator.js';
import {z} from 'zod';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {success} from '../utils/response.js';
const revision=z.number().int().min(1).max(2147483646);
const submit=z.strictObject({revision,scheduleRevision:z.number().int().min(0).max(2147483646)});
const revise=z.strictObject({revision});
const decision=z.strictObject({revision,decision:z.enum(['APPROVE','REJECT']),reason:z.string().trim().min(10).max(1000)});
const query=z.strictObject({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10),status:z.enum(campaignStatuses).optional()});
function id(req){parseInput(emptyQuery,req.query);return parseInput(z.uuid(),req.params.id);}
async function detail(actor,id,admin){const [rows,platforms,categories,contentTypes,deliverables,files,history]=await callProcedureSets('sp_campaign_review_detail',[actor,id,admin]);return {campaign:rows[0],platforms,categories,contentTypes,deliverables,files,history};}
export const reviewController={
 list:async(req,res)=>{const q=parseInput(query,req.query),[items,counts]=await callProcedureSets('sp_campaign_review_list',[req.user.id,q.status||null,q.pageSize,(q.page-1)*q.pageSize]),total=Number(counts[0].total);success(res,'Campaign review queue',{items},{...q,total,totalPages:Math.ceil(total/q.pageSize)});},
 get:async(req,res)=>success(res,'Campaign review',await detail(req.user.id,id(req),req.user.role==='SUPER_ADMIN')),
 transition:async(req,res)=>{const campaignId=id(req),action=req.params.action,isAdmin=req.user.role==='SUPER_ADMIN',input=parseInput(isAdmin?decision:action==='submit'?submit:revise,req.body);await callProcedure('sp_campaign_review_transition',[req.user.id,campaignId,isAdmin?input.decision:action==='submit'?'SUBMIT':'REVISE',input.revision,input.scheduleRevision??null,input.reason??null,req.id]);success(res,'Campaign review updated',await detail(req.user.id,campaignId,isAdmin));},
 download:async(req,res)=>{const campaignId=id(req),fileId=parseInput(z.uuid(),req.params.fileId),rows=await callProcedure('sp_admin_campaign_review_file',[req.user.id,campaignId,fileId,req.id]),file=rows[0];res.setHeader('Content-Type',file.mimeType);res.setHeader('Content-Length',file.fileContent.length);res.setHeader('Content-Disposition',`attachment; filename="campaign-${file.kind.toLowerCase()}-${file.id}.${file.mimeType==='application/pdf'?'pdf':'webp'}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('X-Content-Type-Options','nosniff');res.send(file.fileContent);}
};
