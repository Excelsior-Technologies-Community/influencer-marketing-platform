import { adminService } from '../services/admin.service.js';
import { success } from '../utils/response.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { accountKind,catalogKind,uuidSchema,integerId,accountQuery,catalogQuery,statusSchema,verificationSchema,catalogSchema,auditQuery } from '../validators/admin.validator.js';
export const adminController = {
  dashboard:async(req,res)=>success(res,'Platform overview',await adminService.dashboard(req.user.id)),
  accounts:async(req,res)=>{
    const kind=parseInput(accountKind,req.params.kind),query=parseInput(accountQuery,req.query);
    if(kind==='brands'&&query.verification)parseInput(accountQuery.omit({verification:true}),req.query);
    const result=await adminService.accounts(kind,query);return success(res,'Accounts',{items:result.items},result.meta);
  },
  account:async(req,res)=>success(res,'Account',{account:await adminService.account(parseInput(accountKind,req.params.kind),parseInput(uuidSchema,req.params.id))}),
  status:async(req,res)=>success(res,'Account status updated',{account:await adminService.changeStatus(req.user.id,parseInput(accountKind,req.params.kind),parseInput(uuidSchema,req.params.id),parseInput(statusSchema,req.body),req.id)}),
  verification:async(req,res)=>success(res,'Creator verification updated',{account:await adminService.verify(req.user.id,parseInput(uuidSchema,req.params.id),parseInput(verificationSchema,req.body),req.id)}),
  catalogs:async(req,res)=>{
    const result=await adminService.catalogs(parseInput(catalogKind,req.params.kind),parseInput(catalogQuery,req.query));return success(res,'Catalog',{items:result.items},result.meta);
  },
  saveCatalog:async(req,res)=>{
    const kind=parseInput(catalogKind,req.params.kind),id=req.params.id?parseInput(integerId,req.params.id):null;
    const item=await adminService.saveCatalog(req.user.id,kind,id,parseInput(catalogSchema(kind,id!==null),req.body),req.id);
    res.status(id===null?201:200);return success(res,'Catalog saved',{item});
  },
  audit:async(req,res)=>{const result=await adminService.audit(parseInput(auditQuery,req.query));return success(res,'Audit history',{items:result.items},result.meta);}
};
