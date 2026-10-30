import {z} from 'zod';
export const applicationStatuses=['PENDING','SHORTLISTED','APPROVED','REJECTED','WITHDRAWN'];
export const applicationSubmit=z.strictObject({pitch:z.string().trim().min(20).max(2000)});
export const applicationWithdraw=z.strictObject({revision:z.number().int().min(1).max(2147483646),reason:z.string().trim().min(10).max(500)});
export const applicationQuery=z.strictObject({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10),status:z.enum(applicationStatuses).optional(),q:z.string().trim().max(100).default('')});
