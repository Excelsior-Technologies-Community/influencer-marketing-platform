import { analyticsReportRepository } from '../repositories/analytics-report.repository.js';
import { ApiError } from '../utils/api-error.js';

const maxExportRows=5000;
const columns=[
  ['reportDate','Date'],['eventType','Event'],['campaignTitle','Campaign'],['campaignStatus','Campaign status'],['creatorName','Creator'],
  ['currency','Currency'],['mode','Mode'],['grossMinor','Gross amount (minor units)'],['commissionMinor','Commission (minor units)'],['netMinor','Creator net (minor units)'],['refundedMinor','Refunded (minor units)']
];
function csvCell(value){
  let text=value===null||value===undefined?'':value instanceof Date?value.toISOString():String(value);
  if(/^[\s]*[=+@\-]/.test(text))text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export function reportCsv(rows){return [columns.map(([,label])=>csvCell(label)).join(','),...rows.map(row=>columns.map(([key])=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n';}

export const analyticsReportService={
  async list(actor,role,query){
    const exporting=query.format==='csv';
    const limit=exporting?maxExportRows+1:query.pageSize;
    const offset=exporting?0:(query.page-1)*query.pageSize;
    const [rows,countRows]=await analyticsReportRepository.list([actor,role,query.from||null,query.to||null,query.status||null,query.campaignId||null,query.q,limit,offset]);
    const total=Number(countRows?.[0]?.total||0);
    if(exporting&&total>maxExportRows)throw new ApiError(422,'More than 5,000 rows match. Add filters and export again.');
    return {items:rows||[],meta:{page:query.page,pageSize:query.pageSize,total,totalPages:Math.ceil(total/query.pageSize),exportLimit:maxExportRows}};
  }
};
