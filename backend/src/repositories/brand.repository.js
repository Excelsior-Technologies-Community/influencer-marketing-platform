import { callProcedure } from './procedure.repository.js';
export const brandRepository={
  dashboard:actor=>callProcedure('sp_get_brand_role_dashboard',[actor]),
  get:actor=>callProcedure('sp_get_brand',[actor]),
  update:parameters=>callProcedure('sp_update_brand',parameters),
  logo:actor=>callProcedure('sp_get_brand_logo',[actor]),
  saveLogo:parameters=>callProcedure('sp_save_brand_logo',parameters),
  removeLogo:parameters=>callProcedure('sp_delete_brand_logo',parameters)
};
