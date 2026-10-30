import { z } from 'zod';
export const accountKind = z.enum(['brands','creators']);
export const catalogKind = z.enum(['categories','platforms','content-types']);
export const uuidSchema = z.uuid();
export const integerId = z.coerce.number().int().positive().max(2147483647);
const status = z.enum(['ACTIVE','INACTIVE','SUSPENDED']);
const verification = z.enum(['PENDING','UNDER_REVIEW','VERIFIED','REJECTED']);
const reason = z.string().trim().min(3).max(500);
const paging = { page:z.coerce.number().int().min(1).max(100000).default(1), pageSize:z.coerce.number().int().min(1).max(100).default(20) };
export const accountQuery = z.strictObject({ ...paging, q:z.string().trim().max(100).default(''),status:status.optional(),verification:verification.optional() });
export const catalogQuery = z.strictObject({ ...paging, q:z.string().trim().max(100).default(''),active:z.enum(['true','false']).optional() });
export const statusSchema = z.strictObject({status,reason});
export const verificationSchema = z.strictObject({status:verification,reason});
export const auditQuery = z.strictObject({ ...paging,action:z.string().regex(/^[A-Z_]+$/).max(100).optional(),entityType:z.enum(['user','session','brands','creators','categories','platforms','content-types']).optional(),entityId:z.string().min(1).max(36).optional(),from:z.iso.date().optional(),to:z.iso.date().optional() }).refine(value=>!value.from||!value.to||value.from<=value.to,{path:['to'],message:'End date must follow start date'});
export function catalogSchema(kind, updating = false) {
  const common = { name:z.string().trim().min(2).max(kind==='categories'?120:60),isActive:updating?z.boolean():z.boolean().default(true),reason:updating?reason:reason.optional() };
  return z.strictObject(kind==='categories'?{...common,parentId:integerId.nullable().default(null)}:{...common,code:z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/)});
}
