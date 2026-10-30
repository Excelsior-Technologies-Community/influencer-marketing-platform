import { analyticsReportService,reportCsv } from '../services/analytics-report.service.js';
import { analyticsReportQuery } from '../validators/analytics-report.validator.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { success } from '../utils/response.js';

export const analyticsReportController={
  list:async(req,res)=>{
    const query=parseInput(analyticsReportQuery,req.query);
    const result=await analyticsReportService.list(req.user.id,req.user.role,query);
    if(query.format==='csv'){
      const day=new Date().toISOString().slice(0,10);
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',`attachment; filename="influencer-financial-report-${day}.csv"`);
      res.setHeader('X-Content-Type-Options','nosniff');
      return res.send(reportCsv(result.items));
    }
    return success(res,'Filtered financial report',{items:result.items},result.meta);
  }
};
