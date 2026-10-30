import { callProcedure, callProcedureSets } from './procedure.repository.js';
export const adminRepository = {
  dashboard:async actor=>{
    const [stats,registrations]=await callProcedureSets('sp_get_admin_role_dashboard',[actor]);
    return {stats:stats[0],registrations};
  },
  accounts:(kind,query)=>callProcedureSets(kind==='brands'?'sp_admin_list_brands':'sp_admin_list_creators',query),
  account:(kind,id)=>callProcedure('sp_admin_get_account',[kind,id]),
  changeStatus:params=>callProcedure('sp_admin_change_status',params),
  verify:params=>callProcedure('sp_admin_verify_creator',params),
  catalogs:params=>callProcedureSets('sp_admin_list_catalog',params),
  catalog:params=>callProcedure('sp_admin_get_catalog',params),
  saveCatalog:params=>callProcedure('sp_admin_save_catalog',params),
  audit:params=>callProcedureSets('sp_admin_list_audit',params)
};
