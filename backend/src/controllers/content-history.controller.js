import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {contentDetails} from '../validators/content-submission.validator.js';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {validateCreatorFile} from '../services/creator-file-validation.js';
import {success} from '../utils/response.js';
const version=z.number().int().min(1).max(50),reason=z.string().trim().min(10).max(500),change=z.strictObject({version,reason}),edit=z.strictObject({...contentDetails,version,reason}),upload=z.strictObject({title:z.string().trim().min(2).max(120),reason,version:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(version)}),historyQuery=z.strictObject({version:z.coerce.number().int().min(1).max(50).optional()});
const ids=req=>[parseInput(z.uuid(),req.params.id),parseInput(z.uuid(),req.params.submissionId)];
async function read(req,selected=null){const [rows,versions,snapshots,files,reviews]=await callProcedureSets('sp_content_history',[req.user.id,...ids(req),selected]);return {submission:{...rows[0],canEdit:Boolean(rows[0].canEdit),canResubmit:Boolean(rows[0].canResubmit),retainedBytes:Number(rows[0].retainedBytes)},versions,snapshot:snapshots[0],files,reviews};}
export const contentHistoryController={
 history:async(req,res)=>success(res,'Content version history',await read(req,parseInput(historyQuery,req.query).version??null)),
 resubmit:async(req,res)=>{parseInput(emptyQuery,req.query);const v=parseInput(edit,req.body);await callProcedure('sp_resubmit_content',[req.user.id,...ids(req),v.version,v.contentUrl,v.caption,new Date(v.publishedAt),v.notes,v.reason,req.id]);res.status(201);success(res,'Revision response submitted for Brand review',await read(req));},
 edit:async(req,res)=>{parseInput(emptyQuery,req.query);const v=parseInput(edit,req.body);await callProcedure('sp_edit_content',[req.user.id,...ids(req),v.version,v.contentUrl,v.caption,new Date(v.publishedAt),v.notes,v.reason,req.id]);res.status(201);success(res,'New content version saved',await read(req));},
 upload:async(req,res)=>{parseInput(emptyQuery,req.query);const v=parseInput(upload,req.body);await read(req);const f=await validateCreatorFile(req.file,'PORTFOLIO');await callProcedure('sp_change_content_evidence',[req.user.id,...ids(req),v.version,'ADD_EVIDENCE',randomUUID(),v.title,f.bytes,f.mimeType,f.hash,f.width,f.height,f.pageCount,v.reason,req.id]);res.status(201);success(res,'Evidence added as a new version',await read(req));},
 remove:async(req,res)=>{parseInput(emptyQuery,req.query);const v=parseInput(change,req.body);await callProcedure('sp_change_content_evidence',[req.user.id,...ids(req),v.version,'REMOVE_EVIDENCE',parseInput(z.uuid(),req.params.fileId),null,null,null,null,null,null,null,v.reason,req.id]);res.status(201);success(res,'Evidence removed from the latest version; history retained',await read(req));},
 file:async(req,res)=>{parseInput(emptyQuery,req.query);const [f]=await callProcedure('sp_content_evidence_file',[req.user.id,...ids(req),parseInput(z.coerce.number().int().min(1).max(50),req.params.version),parseInput(z.uuid(),req.params.fileId),req.id]);res.setHeader('Content-Type',f.mimeType);res.setHeader('Content-Length',f.fileContent.length);res.setHeader('Content-Disposition',`attachment; filename="content-evidence-${f.id}.${f.mimeType==='application/pdf'?'pdf':'webp'}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('X-Content-Type-Options','nosniff');res.send(f.fileContent);}
};
