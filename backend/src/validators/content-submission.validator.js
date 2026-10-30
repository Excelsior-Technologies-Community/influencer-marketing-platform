import {isIP} from 'node:net';
import {z} from 'zod';
const publicUrl=z.string().trim().min(10).max(2048).refine(value=>{try{const u=new URL(value),host=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&host.includes('.')&&!isIP(host)&&!host.startsWith('[')&&!['.local','.localhost','.internal'].some(s=>host.endsWith(s));}catch{return false;}},'Use a public HTTPS content URL without credentials or a custom port');
export const contentDetails={contentUrl:publicUrl,caption:z.string().trim().min(1).max(5000),publishedAt:z.iso.datetime({offset:true}),notes:z.string().trim().max(2000).default('')};
