import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {validateCreatorFile} from '../services/creator-file-validation.js';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {ApiError} from '../utils/api-error.js';
import {success} from '../utils/response.js';

const uuid=z.uuid(),messageBody=z.string().trim().min(1).max(4000);
const pageQuery=z.strictObject({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(50)});
const messageInput=z.strictObject({body:messageBody});
const attachmentInput=z.strictObject({body:z.string().trim().max(4000).optional().default(''),title:z.string().trim().min(2).max(120)});
const readInput=z.strictObject({messageIds:z.array(uuid).max(50)});
const id=req=>parseInput(uuid,req.params.id);
const applicationId=req=>parseInput(uuid,req.params.applicationId);

async function conversations(req,campaign){
 const [campaigns,items]=await callProcedureSets('sp_campaign_conversations_read',[req.user.id,req.user.role,campaign]);
 return {campaign:campaigns[0],items:items.map(item=>({...item,unreadCount:Number(item.unreadCount)}))};
}
async function messages(req,campaign,application,q){
 const [conversation,items,counts]=await callProcedureSets('sp_campaign_conversation_messages',[req.user.id,req.user.role,campaign,application,q.pageSize,(q.page-1)*q.pageSize]);
 return {conversation:conversation[0],items:items.map(item=>({...item,isRead:Boolean(item.isRead),attachment:item.attachmentId?{id:item.attachmentId,title:item.attachmentTitle,mimeType:item.attachmentMimeType,byteSize:Number(item.attachmentByteSize)}:null})),meta:{...q,total:Number(counts[0].total),totalPages:Math.ceil(Number(counts[0].total)/q.pageSize)}};
}
function attachmentHeaders(res,file){
 const extension=file.mimeType==='application/pdf'?'pdf':'webp';
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',file.mimeType);res.setHeader('Content-Length',file.fileContent.length);
 res.setHeader('Content-Disposition',`attachment; filename="message-attachment-${file.id}.${extension}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('X-Content-Type-Options','nosniff');
 res.send(file.fileContent);
}

export const campaignConversationsController={
 list:async(req,res)=>{
  parseInput(emptyQuery,req.query);
  success(res,'Campaign conversations',await conversations(req,id(req)));
 },
 messages:async(req,res)=>{
  const query=parseInput(pageQuery,req.query);
  success(res,'Conversation messages',await messages(req,id(req),applicationId(req),query));
 },
 send:async(req,res)=>{
  parseInput(emptyQuery,req.query);
  const input=parseInput(messageInput,req.body),campaign=id(req),application=applicationId(req);
  await callProcedure('sp_campaign_conversation_send',[req.user.id,req.user.role,campaign,application,randomUUID(),input.body,null,null,null,null,null,req.id]);
  res.status(201);success(res,'Message sent',await messages(req,campaign,application,{page:1,pageSize:50}));
 },
 attachment:async(req,res)=>{
  parseInput(emptyQuery,req.query);
  const input=parseInput(attachmentInput,req.body),campaign=id(req),application=applicationId(req);
  // Authorize the participant before spending time processing an uploaded file.
  await messages(req,campaign,application,{page:1,pageSize:1});
  const file=await validateCreatorFile(req.file,'PORTFOLIO'),message=randomUUID();
  await callProcedure('sp_campaign_conversation_send',[req.user.id,req.user.role,campaign,application,message,input.body,randomUUID(),input.title,file.bytes,file.mimeType,file.hash,req.id]);
  res.status(201);success(res,'Message and private attachment sent',await messages(req,campaign,application,{page:1,pageSize:50}));
 },
 markRead:async(req,res)=>{
  parseInput(emptyQuery,req.query);
  const input=parseInput(readInput,req.body);
  const [result]=await callProcedure('sp_campaign_conversation_mark_read',[req.user.id,req.user.role,id(req),applicationId(req),JSON.stringify(input.messageIds)]);
  success(res,'Messages marked as read',{updatedCount:Number(result.updatedCount)});
 },
 download:async(req,res)=>{
  parseInput(emptyQuery,req.query);
  const [file]=await callProcedure('sp_campaign_message_attachment_file',[req.user.id,req.user.role,id(req),applicationId(req),parseInput(uuid,req.params.messageId),parseInput(uuid,req.params.attachmentId),req.id]);
  attachmentHeaders(res,file);
 }
};
