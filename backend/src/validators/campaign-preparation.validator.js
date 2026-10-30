import {z} from 'zod';
export const scheduleFields=['applicationsOpenAt','applicationDeadline','startAt','contentDeadline','endAt'];
const timestamp=z.iso.datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).getUTCFullYear()>=1000&&new Date(value).getUTCFullYear()<=9999,'Use a valid date between years 1000 and 9999').transform(value=>new Date(value).toISOString()).nullable().default(null);
export const campaignScheduleSchema=z.strictObject({...Object.fromEntries(scheduleFields.map(key=>[key,timestamp])),revision:z.number().int().min(0).max(2147483646)}).superRefine((value,ctx)=>{
  const dates=scheduleFields.map(key=>value[key]);if(dates.every(date=>date===null))return;
  if(dates.some(date=>date===null)){ctx.addIssue({code:'custom',path:['schedule'],message:'Complete all five dates, or clear them all'});return;}
  const [open,apply,start,content,end]=dates.map(Date.parse);
  if(!(open<apply&&apply<=start&&start<content&&content<=end))ctx.addIssue({code:'custom',path:['schedule'],message:'Use applications open < application deadline ≤ campaign start < content deadline ≤ campaign end'});
});
const revision=z.number().int().min(1).max(2147483646),title=z.string().trim().min(2).max(120);
export const campaignFileCreate=z.strictObject({kind:z.enum(['BRIEF','REFERENCE']),title});
export const campaignFileReplace=z.strictObject({title,revision:z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(revision)});
export const campaignFileDelete=z.strictObject({revision});
