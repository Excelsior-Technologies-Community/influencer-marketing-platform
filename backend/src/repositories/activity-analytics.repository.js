import { callProcedure,callProcedureSets } from './procedure.repository.js';

export const activityAnalyticsRepository={
  track:parameters=>callProcedure('sp_track_analytics_event',parameters),
  creator:actor=>callProcedureSets('sp_creator_activity_analytics',[actor]),
  admin:actor=>callProcedureSets('sp_admin_user_screen_analytics',[actor])
};
