import nodemailer from 'nodemailer';
import {env} from '../config/env.js';
import {callProcedure} from '../repositories/procedure.repository.js';

const configured=Boolean(env.EMAIL_HOST&&env.EMAIL_FROM);
const transporter=configured?nodemailer.createTransport({
 host:env.EMAIL_HOST,
 port:env.EMAIL_PORT,
 secure:env.EMAIL_SECURE==='true',
 ...(env.EMAIL_USER||env.EMAIL_PASSWORD?{auth:{user:env.EMAIL_USER,pass:env.EMAIL_PASSWORD}}:{}),
 connectionTimeout:10000,
 greetingTimeout:10000,
 socketTimeout:20000
}):null;

function safeErrorCode(error){
 const known=String(error?.code||'').toUpperCase();
 return /^[A-Z0-9_]{1,40}$/.test(known)?known:'DELIVERY_FAILED';
}

export async function drainEmailOutbox({limit=10}={}){
 if(!configured)return {configured:false,processed:0};
 await callProcedure('sp_email_enqueue_deadline_reminders');
 let processed=0;
 for(let i=0;i<limit;i++){
  const rows=await callProcedure('sp_email_outbox_claim');
  const job=Array.isArray(rows)?rows[0]:null;
  if(!job)break;
  // RFC-reserved .invalid addresses are used by local fixtures and can never
  // receive mail. Dead-letter them immediately instead of retrying SMTP.
  const recipientDomain=String(job.recipient_email||'').split('@').at(-1)?.toLowerCase()||'';
  if(recipientDomain.endsWith('.invalid')){
   await callProcedure('sp_email_outbox_failed',[job.id,'INVALID_RECIPIENT']);
   processed++;
   continue;
  }
  try{
   const target=new URL(job.targetPath,`${env.CLIENT_URL.replace(/\/$/,'')}/`).toString();
   await transporter.sendMail({
    from:env.EMAIL_FROM,
    to:job.recipient_email,
    subject:job.subject,
    text:`${job.body_text}\n\nOpen your account: ${target}`
   });
   await callProcedure('sp_email_outbox_sent',[job.id]);
  }catch(error){
   await callProcedure('sp_email_outbox_failed',[job.id,safeErrorCode(error)]);
  }
  processed++;
 }
 return {configured:true,processed};
}

export function startEmailDeliveryClock(){
 if(!configured){console.log(JSON.stringify({event:'email_delivery_disabled',reason:'smtp_not_configured'}));return async()=>{};}
 let running=false,stopped=false,pending=Promise.resolve();
 const tick=()=>{
  if(running||stopped)return;
  running=true;
  pending=drainEmailOutbox().catch(error=>console.error(JSON.stringify({event:'email_delivery_clock_failed',code:safeErrorCode(error)}))).finally(()=>{running=false;});
 };
 const timer=setInterval(tick,60000);
 timer.unref();
 tick();
 return async()=>{stopped=true;clearInterval(timer);await pending;};
}
