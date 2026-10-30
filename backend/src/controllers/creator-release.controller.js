import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {success} from '../utils/response.js';
const campaign=req=>{parseInput(emptyQuery,req.query);return parseInput(z.uuid(),req.params.id);};
async function preview(actor,id){const [rows,items]=await callProcedureSets('sp_creator_release_preview',[actor,id]);const row=rows[0];return {release:{...row,released:Boolean(row.released),canRelease:Boolean(row.canRelease)},items};}
export const creatorReleaseController={
 read:async(req,res)=>success(res,'Creator earnings release preview',await preview(req.user.id,campaign(req))),
 release:async(req,res)=>{const id=campaign(req),body=parseInput(z.strictObject({revision:z.number().int().min(0)}),req.body);await callProcedure('sp_release_creator_payment',[req.user.id,id,body.revision,req.id]);success(res,'Creator test-wallet earnings released',await preview(req.user.id,id));}
};
