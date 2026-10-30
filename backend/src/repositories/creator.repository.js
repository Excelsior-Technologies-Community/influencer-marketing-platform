import { callProcedure, callProcedureSets } from './procedure.repository.js';
export const creatorRepository={
  roleDashboard:actor=>callProcedure('sp_get_creator_role_dashboard',[actor]),
  dashboard:actor=>callProcedureSets('sp_get_creator_dashboard',[actor]),
  get:actor=>callProcedureSets('sp_get_creator',[actor]),
  update:parameters=>callProcedureSets('sp_update_creator',parameters),
  categories:parameters=>callProcedureSets('sp_get_creator_profile_categories',parameters)
};
