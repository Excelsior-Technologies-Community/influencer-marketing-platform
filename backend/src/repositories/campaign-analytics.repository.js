import { callProcedureSets } from './procedure.repository.js';

export const campaignAnalyticsRepository={
  list:parameters=>callProcedureSets('sp_brand_campaign_analytics',parameters)
};
