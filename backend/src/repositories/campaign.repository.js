import { callProcedure,callProcedureSets } from './procedure.repository.js';
export const campaignRepository={get:parameters=>callProcedureSets('sp_get_campaign',parameters),list:parameters=>callProcedureSets('sp_list_campaign_management',parameters),catalogs:parameters=>callProcedureSets('sp_campaign_catalogs',parameters),save:parameters=>callProcedure('sp_save_campaign_draft',parameters)};
