import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {success} from '../utils/response.js';

const instant=z.iso.datetime({offset:true}).refine(value=>{const year=new Date(value).getUTCFullYear();return year>=1000&&year<=9999;},'Date is outside the supported range');
const fields={page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10),from:instant.optional(),to:instant.optional(),campaignId:z.uuid().optional()};
const range=q=>!q.from||!q.to||new Date(q.from)<new Date(q.to);
const transactions=z.strictObject({...fields,direction:z.enum(['CREDIT','DEBIT']).optional()}).refine(range,'From must be earlier than To');
const payments=z.strictObject({...fields,status:z.enum(['AUTHORIZED','CAPTURED','FAILED']).optional()}).refine(range,'From must be earlier than To');
function pagination(q,total){return {...q,total:Number(total),totalPages:Math.ceil(Number(total)/q.pageSize)};}
function params(q){return [q.from?new Date(q.from):null,q.to?new Date(q.to):null,q.campaignId??null,q.pageSize,(q.page-1)*q.pageSize];}
export const walletController={
 summary:async(req,res)=>{parseInput(emptyQuery,req.query);const [wallet]=await callProcedure('sp_wallet_summary',[req.user.id,req.user.role]);success(res,'Your test wallet',{wallet:{...wallet,transactionCount:Number(wallet.transactionCount)}});},
 transactions:async(req,res)=>{const q=parseInput(transactions,req.query),[items,counts]=await callProcedureSets('sp_wallet_transactions',[req.user.id,req.user.role,q.direction??null,...params(q)]);success(res,'Your wallet transactions',{items},pagination(q,counts[0].total));},
 payments:async(req,res)=>{const q=parseInput(payments,req.query),[items,counts]=await callProcedureSets('sp_wallet_payment_history',[req.user.id,q.status??null,...params(q)]);success(res,'Your verified payment attempts',{items},pagination(q,counts[0].total));}
};
