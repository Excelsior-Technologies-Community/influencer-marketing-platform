import {randomUUID} from 'node:crypto';
import {contentDetails} from '../validators/content-submission.validator.js';
import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {success} from '../utils/response.js';
const input=z.strictObject({platformId:z.number().int().positive().max(2147483647),contentTypeId:z.number().int().positive().max(2147483647),unitNumber:z.number().int().min(1).max(100),...contentDetails});
const query=z.strictObject({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10)});
export const contentController={
 list:async(req,res)=>{const id=parseInput(z.uuid(),req.params.id),q=parseInput(query,req.query),[campaigns,deliverables,items,counts]=await callProcedureSets('sp_creator_content_submissions',[req.user.id,id,q.pageSize,(q.page-1)*q.pageSize]),total=Number(counts[0].total);success(res,'Your content submissions',{campaign:{...campaigns[0],canSubmit:Boolean(campaigns[0].canSubmit)},deliverables:deliverables.map(d=>({...d,submittedUnits:d.submittedUnits||[]})),items},{...q,total,totalPages:Math.ceil(total/q.pageSize)});},
 submit:async(req,res)=>{parseInput(emptyQuery,req.query);const id=parseInput(z.uuid(),req.params.id),v=parseInput(input,req.body),[submission]=await callProcedure('sp_submit_content',[req.user.id,id,randomUUID(),v.platformId,v.contentTypeId,v.unitNumber,v.contentUrl,v.caption,new Date(v.publishedAt),v.notes,req.id]);res.status(201);success(res,'Content submitted',{submission});}
};
