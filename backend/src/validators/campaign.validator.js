import {campaignStatuses} from './campaign-lifecycle.validator.js';
import { z } from 'zod';
const id=z.number().int().positive().max(2147483647);
const ids=z.array(id).max(10).refine(values=>new Set(values).size===values.length,'Remove duplicate choices').default([]);
const text=max=>z.string().trim().max(max).transform(value=>value||null).nullable().default(null);
const budget=z.string().trim().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/,'Use a decimal amount up to 999999999.99 with at most two decimals').refine(value=>/[1-9]/.test(value),'Budget must be greater than zero').nullable().default(null);
const fields={title:z.string().trim().min(3).max(160),description:text(5000),totalBudget:budget,currency:z.enum(['INR','USD','EUR','GBP']),creatorSlots:z.number().int().min(1).max(10000).default(1),requirements:text(3000),platformIds:ids,categoryIds:ids,contentTypeIds:ids,deliverables:z.array(z.strictObject({platformId:id,contentTypeId:id,quantity:z.number().int().min(1).max(100),description:text(1000)})).max(20).default([])};
function coherent(value,ctx){const pairs=new Set();for(const [index,item] of value.deliverables.entries()){const pair=`${item.platformId}:${item.contentTypeId}`;if(pairs.has(pair))ctx.addIssue({code:'custom',path:['deliverables',index],message:'Use one row per platform/content-type pair'});pairs.add(pair);if(!value.platformIds.includes(item.platformId)||!value.contentTypeIds.includes(item.contentTypeId))ctx.addIssue({code:'custom',path:['deliverables',index],message:'Choose a selected platform and content type'});}}
export const campaignCreateSchema=z.strictObject(fields).superRefine(coherent);
export const campaignUpdateSchema=z.strictObject({...fields,revision:z.number().int().min(1).max(2147483646)}).superRefine(coherent);
export const campaignListQuery=z.strictObject({status:z.enum(campaignStatuses).optional(),q:z.string().trim().max(100).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10)});
export const campaignCatalogQuery=z.strictObject({campaignId:z.uuid().optional()});
export const campaignIdSchema=z.uuid();
