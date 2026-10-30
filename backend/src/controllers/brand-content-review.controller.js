import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {success} from '../utils/response.js';
const statuses=['SUBMITTED','APPROVED','REJECTED','REVISION_REQUESTED'];
const query=z.strictObject({q:z.string().trim().max(100).default(''),status:z.enum(statuses).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10)});
const selected=z.strictObject({version:z.coerce.number().int().min(1).max(50).optional()}),decision=z.strictObject({version:z.number().int().min(1).max(50),decision:z.enum(['APPROVE','REJECT','REQUEST_REVISION']),reason:z.string().trim().min(10).max(500)});
const ids=req=>[parseInput(z.uuid(),req.params.id),parseInput(z.uuid(),req.params.submissionId)];
async function read(req,version=null){const [rows,versions,snapshots,files,reviews]=await callProcedureSets('sp_brand_content_history',[req.user.id,...ids(req),version]),head=rows[0],snapshot=snapshots[0],actions=[];if(head.canReview&&snapshot.version===head.version){actions.push('APPROVE','REJECT');if(head.canRequestRevision)actions.push('REQUEST_REVISION');}return {submission:{...head,canReview:Boolean(head.canReview),canRequestRevision:Boolean(head.canRequestRevision)},snapshot,versions,files,reviews,actions};}
export const brandContentController={
 list:async(req,res)=>{const q=parseInput(query,req.query),[campaigns,items,counts]=await callProcedureSets('sp_brand_content_list',[req.user.id,parseInput(z.uuid(),req.params.id),q.status??null,q.q,q.pageSize,(q.page-1)*q.pageSize]),total=Number(counts[0].total);success(res,'Campaign content submissions',{campaign:campaigns[0],items},{...q,total,totalPages:Math.ceil(total/q.pageSize)});},
 history:async(req,res)=>success(res,'Submitted content review',await read(req,parseInput(selected,req.query).version??null)),
 decide:async(req,res)=>{parseInput(emptyQuery,req.query);const v=parseInput(decision,req.body);await callProcedure('sp_brand_review_content',[req.user.id,...ids(req),v.version,v.decision,v.reason,req.id]);success(res,'Content review saved',await read(req));},
 file:async(req,res)=>{parseInput(emptyQuery,req.query);const [f]=await callProcedure('sp_brand_content_evidence',[req.user.id,...ids(req),parseInput(z.coerce.number().int().min(1).max(50),req.params.version),parseInput(z.uuid(),req.params.fileId),req.id]);res.setHeader('Content-Type',f.mimeType);res.setHeader('Content-Length',f.fileContent.length);res.setHeader('Content-Disposition',`attachment; filename="content-evidence-${f.id}.${f.mimeType==='application/pdf'?'pdf':'webp'}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('X-Content-Type-Options','nosniff');res.send(f.fileContent);}
};
