import { z } from 'zod';
import { isIP } from 'node:net';
const count=z.number().int().min(0).max(1000000000000).nullable().default(null);
const url=z.string().trim().max(2048).refine(value=>{
  try {const parsed=new URL(value),host=parsed.hostname.toLowerCase();return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&(!parsed.port||parsed.port==='443')&&host.includes('.')&&!isIP(host)&&!host.startsWith('[')&&!['.localhost','.local','.internal'].some(suffix=>host.endsWith(suffix));}catch{return false;}
},'Enter a public HTTPS profile URL without credentials or a custom port');
const fields={username:z.string().trim().transform(value=>value.replace(/^@/,'' )).pipe(z.string().min(1).max(100).regex(/^[\p{L}\p{N}._-]+$/u,'Use a username, without spaces or a URL')),profileUrl:url,followersCount:count,averageViews:count,engagementRate:z.number().min(0).max(100).multipleOf(0.01).nullable().default(null)};
export const socialCreateSchema=z.strictObject({platformId:z.number().int().positive().max(2147483647),...fields});
export const socialUpdateSchema=z.strictObject({...fields,revision:z.number().int().min(1).max(2147483646)});
export const socialDeleteSchema=z.strictObject({revision:z.number().int().min(1).max(2147483646)});
export const socialIdSchema=z.uuid();
