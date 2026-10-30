import { z } from 'zod';
const optionalText=limit=>z.string().trim().max(limit).transform(value=>value||null).nullable().default(null);
const webUrl=z.string().trim().max(2048).refine(value=>{
  if(!value)return true;
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
},'Use an HTTP or HTTPS URL without embedded credentials').transform(value=>value||null).nullable().default(null);
const email=z.union([z.email().max(254).transform(value=>value.toLowerCase()),z.literal('')]).transform(value=>value||null).nullable().default(null);
const phone=z.string().trim().max(32).refine(value=>!value||/^\+?[0-9][0-9 ()-]{5,30}[0-9]$/.test(value),'Use a valid phone number').transform(value=>value||null).nullable().default(null);
export const socialLinksSchema=z.strictObject({instagram:webUrl,facebook:webUrl,youtube:webUrl}).default({});
export const billingSchema=z.strictObject({name:optionalText(160),email,taxId:optionalText(64),addressLine1:optionalText(240),addressLine2:optionalText(240),city:optionalText(120),state:optionalText(120),postalCode:optionalText(32),country:optionalText(120)}).default({});
export const profileSchema=z.strictObject({companyName:z.string().trim().min(2).max(160),website:webUrl,industry:optionalText(120),description:optionalText(5000),contactName:optionalText(120),contactEmail:email,phone,location:optionalText(240),socialLinks:socialLinksSchema,billing:billingSchema,revision:z.number().int().min(0).max(2147483646)});
export const emptyQuery=z.strictObject({});
export const logoUploadSchema=z.strictObject({revision:z.string().regex(/^(0|[1-9]\d*)$/,'Use the current numeric logo revision').transform(Number).pipe(z.number().int().min(0).max(2147483646))});
export const logoDeleteSchema=z.strictObject({revision:z.number().int().min(0).max(2147483646)});
export function emptyDetails(){return {contactName:null,contactEmail:null,phone:null,location:null,socialLinks:{instagram:null,facebook:null,youtube:null},billing:{name:null,email:null,taxId:null,addressLine1:null,addressLine2:null,city:null,state:null,postalCode:null,country:null}};}
