import {z} from 'zod';
export const campaignStatuses=['DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','LIVE','PAUSED','APPLICATION_CLOSED','IN_PROGRESS','CONTENT_SUBMITTED','UNDER_REVIEW','COMPLETED','CANCELLED','EXPIRED'];
export const lifecycleAction=z.strictObject({action:z.enum(['PUBLISH','PAUSE','RESUME','CANCEL']),revision:z.number().int().min(1).max(2147483646),reason:z.string().trim().min(10).max(1000)});
export const lifecycleDelete=z.strictObject({revision:z.number().int().min(1).max(2147483646)});
