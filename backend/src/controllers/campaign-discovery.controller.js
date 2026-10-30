import {z} from 'zod';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {success} from '../utils/response.js';
import {ApiError} from '../utils/api-error.js';
const filterId=z.coerce.number().int().positive().max(2147483647).optional();
export const discoveryQuery=z.strictObject({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10),q:z.string().trim().max(100).default(''),platformId:filterId,categoryId:filterId,contentTypeId:filterId,currency:z.enum(['INR','USD','EUR','GBP']).optional()});
function id(req){parseInput(emptyQuery,req.query);return parseInput(z.uuid(),req.params.id);}
export const discoveryController={
 catalogs:async(req,res)=>{parseInput(emptyQuery,req.query);const [platforms,categories,contentTypes]=await callProcedureSets('sp_creator_campaign_catalogs',[req.user.id]);success(res,'Campaign filters',{platforms,categories,contentTypes});},
 list:async(req,res)=>{const q=parseInput(discoveryQuery,req.query),[items,counts]=await callProcedureSets('sp_creator_discover_campaigns',[req.user.id,q.q,q.platformId??null,q.categoryId??null,q.contentTypeId??null,q.currency??null,q.pageSize,(q.page-1)*q.pageSize]),total=Number(counts[0].total);success(res,'Discover live campaigns',{items},{...q,total,totalPages:Math.ceil(total/q.pageSize)});},
 detail:async(req,res)=>{const [rows,platforms,categories,contentTypes,deliverables,files]=await callProcedureSets('sp_creator_campaign_detail',[req.user.id,id(req)]);success(res,'Live campaign details',{campaign:rows[0],platforms,categories,contentTypes,deliverables,files});},
 download:async(req,res)=>{const campaignId=id(req),fileId=parseInput(z.uuid(),req.params.fileId),rows=await callProcedure('sp_creator_campaign_file',[req.user.id,campaignId,fileId]);if(!rows.length)throw new ApiError(404,'Campaign file is unavailable');const file=rows[0];res.setHeader('Content-Type',file.mimeType);res.setHeader('Content-Length',file.fileContent.length);res.setHeader('Content-Disposition',`attachment; filename="campaign-${file.kind.toLowerCase()}-${file.id}.${file.mimeType==='application/pdf'?'pdf':'webp'}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('X-Content-Type-Options','nosniff');res.send(file.fileContent);}
};
