const response=(description,ok=true)=>({description,content:{'application/json':{schema:{$ref:`#/components/schemas/${ok?'Success':'Error'}`}}}});
export const campaignAnalyticsPaths={
  '/brand/analytics/campaigns':{get:{tags:['Brand'],summary:'List campaign performance analytics',security:[{bearerAuth:[]}],description:'Active BRAND_ADMIN only. Every campaign is scoped to the authenticated Brand. Returns applications, approved allocated creators, submitted/approved/required deliverables and budget versus posted Test Mode funding, Creator releases, commission, refunds and held balance. Campaign-post reach/impressions/views/engagement are null with NOT_RECORDED status until campaign-level source data is recorded; creator profile metrics are not substituted.',parameters:[
    {name:'status',in:'query',schema:{type:'string',enum:['DRAFT','PENDING_APPROVAL','APPROVED','LIVE','APPLICATION_CLOSED','IN_PROGRESS','CONTENT_SUBMITTED','UNDER_REVIEW','COMPLETED','REJECTED','PAUSED','CANCELLED','EXPIRED']}},
    {name:'q',in:'query',schema:{type:'string',maxLength:100}},
    {name:'page',in:'query',schema:{type:'integer',minimum:1,default:1}},
    {name:'pageSize',in:'query',schema:{type:'integer',minimum:1,maximum:50,default:10}}
  ],responses:{200:response('Own campaign analytics and pagination'),401:response('Authentication required or account suspended',false),403:response('Role or origin protection denied',false),422:response('Invalid query',false),429:response('Request limit exceeded',false),500:response('Unexpected server error; no internal details exposed',false)}}}
};
