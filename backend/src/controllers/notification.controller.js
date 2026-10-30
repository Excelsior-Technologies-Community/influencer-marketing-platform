import {z} from 'zod';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {parseInput} from '../middlewares/validate.middleware.js';
import {success} from '../utils/response.js';

const query=z.strictObject({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20)});
const uuid=z.uuid();

export const notificationController={
 list:async(req,res)=>{
  const q=parseInput(query,req.query),[items,totals]=await callProcedureSets('sp_notification_list',[req.user.id,q.pageSize,(q.page-1)*q.pageSize]);
  const total=Number(totals[0].total),unreadCount=Number(totals[0].unreadCount);
  success(res,'Your notifications',{items:items.map(item=>({...item,unread:Boolean(item.unread)}))},{...q,total,totalPages:Math.ceil(total/q.pageSize),unreadCount});
 },
 unreadCount:async(req,res)=>{
  const [result]=await callProcedure('sp_notification_unread_count',[req.user.id]);
  success(res,'Unread notification count',{unreadCount:Number(result.unreadCount)});
 },
 markRead:async(req,res)=>{
  const id=parseInput(uuid,req.params.id),[item]=await callProcedure('sp_notification_mark_read',[req.user.id,id]);
  success(res,'Notification marked as read',{notification:{...item,unread:false}});
 },
 markAllRead:async(req,res)=>{
  const [result]=await callProcedure('sp_notification_mark_all_read',[req.user.id]);
  success(res,'All notifications marked as read',{updatedCount:Number(result.updatedCount)});
 }
};
