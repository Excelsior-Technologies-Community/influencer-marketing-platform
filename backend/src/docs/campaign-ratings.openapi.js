const pathId={in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}};
const reply=(description,ok=true)=>({description,content:{'application/json':{schema:{$ref:`#/components/schemas/${ok?'Success':'Error'}`}}}});
function operation(summary,method){
 const result={tags:['Reviews'],summary,security:[{bearerAuth:[]}],parameters:[pathId],responses:{200:reply('Campaign, eligible review targets and reviews visible to this participant'),401:reply('Authentication required',false),403:reply('Role or participant access denied',false),404:reply('Campaign or review target not found',false),409:reply('Campaign is not complete or this participant has already been reviewed',false),422:reply('Invalid rating or comment',false)}};
 if(method==='post'){
  result.parameters.push({in:'header',name:'X-Requested-With',required:true,schema:{type:'string',enum:['InfluenceWeb']}});
  result.requestBody={required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,required:['revieweeUserId','rating'],properties:{revieweeUserId:{type:'string',format:'uuid'},rating:{type:'integer',minimum:1,maximum:5},comment:{type:'string',maxLength:1000}}}}}};
 }
 return result;
}
export const campaignRatingsPaths={
 '/brand/workspaces/{id}/reviews':{get:operation('Read reviews for an owned completed campaign','get'),post:operation('Review an approved Creator after campaign completion','post')},
 '/creator/workspaces/{id}/reviews':{get:operation('Read reviews for an allocated completed campaign','get'),post:operation('Review the owning Brand after campaign completion','post')}
};
