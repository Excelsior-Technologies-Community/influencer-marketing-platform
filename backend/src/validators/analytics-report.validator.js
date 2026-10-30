import { z } from 'zod';
import { campaignStatuses } from './campaign-lifecycle.validator.js';

export const analyticsReportQuery=z.strictObject({
  from:z.iso.date().optional(),
  to:z.iso.date().optional(),
  status:z.enum(campaignStatuses).optional(),
  campaignId:z.uuid().optional(),
  q:z.string().trim().max(100).default(''),
  page:z.coerce.number().int().min(1).max(10000).default(1),
  pageSize:z.coerce.number().int().min(1).max(50).default(10),
  format:z.enum(['json','csv']).default('json')
}).superRefine((value,ctx)=>{
  if(value.from&&value.to){
    const from=Date.parse(`${value.from}T00:00:00Z`),to=Date.parse(`${value.to}T00:00:00Z`);
    if(from>to)ctx.addIssue({code:'custom',path:['from'],message:'From date must not be after To date'});
    if(to-from>366*86400000)ctx.addIssue({code:'custom',path:['to'],message:'Date range cannot exceed 367 calendar days'});
  }
});
