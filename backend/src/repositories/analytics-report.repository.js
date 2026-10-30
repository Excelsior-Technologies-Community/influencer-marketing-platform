import { callProcedureSets } from './procedure.repository.js';

export const analyticsReportRepository={
  list:parameters=>callProcedureSets('sp_analytics_report',parameters)
};
