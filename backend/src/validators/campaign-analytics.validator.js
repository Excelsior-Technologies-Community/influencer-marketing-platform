import { z } from 'zod';
import { campaignStatuses } from './campaign-lifecycle.validator.js';

export const campaignAnalyticsQuery=z.strictObject({
  status:z.enum(campaignStatuses).optional(),
  q:z.string().trim().max(100).default(''),
  page:z.coerce.number().int().min(1).max(100000).default(1),
  pageSize:z.coerce.number().int().min(1).max(50).default(10)
});
