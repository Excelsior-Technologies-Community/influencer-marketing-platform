import { activityAnalyticsRepository } from '../repositories/activity-analytics.repository.js';

const numberFields=['totalSessions','totalPageViews','averageSessionDurationMs','usersTracked','activeUsersToday','pageViews','users','sessions','totalDurationMs','averageDurationMs'];
const numerics=row=>Object.fromEntries(numberFields.filter(key=>row[key]!==undefined).map(key=>[key,Number(row[key])||0]));

export const activityAnalyticsService={
  track:(actor,event)=>activityAnalyticsRepository.track([actor,event.eventId,event.sessionId,event.screen,event.durationMs]),
  async creator(actor){
    const [socialRows,summaryRows,pages]=await activityAnalyticsRepository.creator(actor);
    const summary=summaryRows[0]||{};
    return {
      socialAccounts:socialRows.map(row=>({...row,followersCount:row.followersCount===null?null:Number(row.followersCount),averageViews:row.averageViews===null?null:Number(row.averageViews),engagementRate:row.engagementRate===null?null:Number(row.engagementRate)})),
      activity:{...numerics(summary),mostVisitedPage:summary.mostVisitedPage||null,highestTimeSpentPage:summary.highestTimeSpentPage||null},
      pages:pages.map(row=>({...row,...numerics(row)}))
    };
  },
  async admin(actor){
    const [summaryRows,pages]=await activityAnalyticsRepository.admin(actor);
    const summary=summaryRows[0]||{};
    return {summary:{...numerics(summary),mostVisitedPage:summary.mostVisitedPage||null,highestTimeSpentPage:summary.highestTimeSpentPage||null},pages:pages.map(row=>({...row,...numerics(row)}))};
  }
};
