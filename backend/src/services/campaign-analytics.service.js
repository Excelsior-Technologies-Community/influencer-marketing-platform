import { campaignAnalyticsRepository } from '../repositories/campaign-analytics.repository.js';

const countFields=['applications','approvedCreators','submittedDeliverables','requiredDeliverables','approvedDeliverables'];
export const campaignAnalyticsService={
  async list(actor,query){
    const [items,counts]=await campaignAnalyticsRepository.list([actor,query.status||null,query.q,query.pageSize,(query.page-1)*query.pageSize]);
    return {
      items:items.map(row=>({
        ...row,
        ...Object.fromEntries(countFields.map(key=>[key,Number(row[key])])),
        budgetAmount:row.budgetAmount===null?null:String(row.budgetAmount),
        budgetMinor:row.budgetMinor===null?null:String(row.budgetMinor),
        fundedMinor:row.fundedMinor===null?null:String(row.fundedMinor),
        releasedGrossMinor:String(row.releasedGrossMinor),
        creatorPayoutMinor:String(row.creatorPayoutMinor),
        commissionMinor:String(row.commissionMinor),
        refundedMinor:String(row.refundedMinor),
        heldMinor:String(row.heldMinor),
        performance:{status:row.performanceStatus,reach:null,impressions:null,views:null,engagements:null,engagementRate:null}
      })),
      meta:{page:query.page,pageSize:query.pageSize,total:Number(counts[0].total),totalPages:Math.ceil(Number(counts[0].total)/query.pageSize)}
    };
  }
};
