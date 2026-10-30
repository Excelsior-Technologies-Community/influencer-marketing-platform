const reply=(description,ok=true)=>({description,content:{'application/json':{schema:{$ref:`#/components/schemas/${ok?'Success':'Error'}`}}}});
const protect={in:'header',name:'X-Requested-With',required:true,schema:{type:'string',enum:['InfluenceWeb']}};
const access={401:reply('Authentication required',false),403:reply('An active account is required',false)};
export const notificationPaths={
 '/notifications':{get:{tags:['Notifications'],summary:'Read your own paginated in-app notifications',security:[{bearerAuth:[]}],parameters:[{in:'query',name:'page',schema:{type:'integer',minimum:1,default:1}},{in:'query',name:'pageSize',schema:{type:'integer',minimum:1,maximum:50,default:20}}],responses:{200:reply('Own notification items, unread state and pagination'),...access,422:reply('Invalid pagination',false)}}},
 '/notifications/unread-count':{get:{tags:['Notifications'],summary:'Read your own unread notification count',security:[{bearerAuth:[]}],responses:{200:reply('Unread count for the signed-in account'),...access}}},
 '/notifications/read-all':{post:{tags:['Notifications'],summary:'Mark all your notifications as read',security:[{bearerAuth:[]}],parameters:[protect],responses:{200:reply('Number of notifications marked as read'),...access}}},
 '/notifications/{id}/read':{post:{tags:['Notifications'],summary:'Mark one of your notifications as read',security:[{bearerAuth:[]}],parameters:[{in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}},protect],responses:{200:reply('The signed-in account notification with read status'),...access,404:reply('Notification not found',false)}}}
};
