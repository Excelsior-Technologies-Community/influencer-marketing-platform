import {z} from 'zod';
import {applicationStatuses} from './campaign-application.validator.js';
export const applicantQuery=z.strictObject({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10),status:z.enum(applicationStatuses).optional(),q:z.string().trim().max(100).default('')});
export const applicantDecision=z.strictObject({decision:z.enum(['SHORTLIST','APPROVE','REJECT']),revision:z.number().int().min(1).max(2147483646),reason:z.string().trim().min(10).max(500)});
