import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {callProcedureSets,callProcedure} from '../repositories/procedure.repository.js';
import {success} from '../utils/response.js';
const query=z.strictObject({q:z.string().trim().max(100).default(''),status:z.enum(['LIVE','PAUSED','APPLICATION_CLOSED','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED']).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10)});
const progressData=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,k==='canComplete'?Boolean(v):['revision','creatorSlots','allocatedSlots','itemsPerCreator','requiredItems','approvedItems'].includes(k)?Number(v):v]));
const id=req=>{parseInput(emptyQuery,req.query);return parseInput(z.uuid(),req.params.id);};
export const workspaceController={
 list:async(req,res)=>{const q=parseInput(query,req.query),[items,counts]=await callProcedureSets('sp_campaign_workspaces',[req.user.id,req.user.role,q.status??null,q.q,q.pageSize,(q.page-1)*q.pageSize]),total=Number(counts[0].total);success(res,'Your campaign workspaces',{items},{...q,total,totalPages:Math.ceil(total/q.pageSize)});},
 get:async(req,res)=>{const [campaigns,deliverables,files,participants]=await callProcedureSets('sp_campaign_workspace',[req.user.id,req.user.role,id(req)]);success(res,'Campaign workspace',{campaign:campaigns[0],deliverables,files,participants});},
 progress:async(req,res)=>{const [row]=await callProcedure('sp_content_progress',[req.user.id,req.user.role,id(req)]);success(res,'Deliverable completion progress',{progress:progressData(row)});},
 complete:async(req,res)=>{const campaign=id(req),v=parseInput(z.strictObject({revision:z.number().int().min(0),reason:z.string().trim().min(10).max(500)}),req.body);await callProcedure('sp_complete_content_campaign',[req.user.id,campaign,v.revision,v.reason,req.id]);const [row]=await callProcedure('sp_content_progress',[req.user.id,req.user.role,campaign]);success(res,'Campaign completed',{progress:progressData(row)});},
 file:async(req,res)=>{const [f]=await callProcedure('sp_campaign_workspace_file',[req.user.id,req.user.role,id(req),parseInput(z.uuid(),req.params.fileId),req.id]);res.setHeader('Content-Type',f.mimeType);res.setHeader('Content-Length',f.fileContent.length);res.setHeader('Content-Disposition',`attachment; filename="campaign-${f.id}.${f.mimeType==='application/pdf'?'pdf':'webp'}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('X-Content-Type-Options','nosniff');res.send(f.fileContent);}
};
