import { brandService } from '../services/brand.service.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { emptyQuery,profileSchema,logoUploadSchema,logoDeleteSchema } from '../validators/brand.validator.js';
import { success } from '../utils/response.js';
export const brandController={
  profile:async(req,res)=>{parseInput(emptyQuery,req.query);success(res,'Your brand profile',{profile:await brandService.profile(req.user.id)});},
  dashboard:async(req,res)=>{parseInput(emptyQuery,req.query);success(res,'Brand overview',await brandService.dashboard(req.user.id));},
  update:async(req,res)=>{parseInput(emptyQuery,req.query);success(res,'Brand profile saved',{profile:await brandService.update(req.user.id,parseInput(profileSchema,req.body),req.id)});},
  logo:async(req,res)=>{
    parseInput(emptyQuery,req.query);const logo=await brandService.logo(req.user.id);
    res.setHeader('Content-Type',logo.mimeType);res.setHeader('Content-Length',logo.image.length);res.setHeader('Content-Disposition','inline; filename="company-logo.webp"');res.setHeader('X-Content-Type-Options','nosniff');res.send(logo.image);
  },
  upload:async(req,res)=>{parseInput(emptyQuery,req.query);const input=parseInput(logoUploadSchema,req.body);success(res,'Company logo saved',{profile:await brandService.upload(req.user.id,req.file,input.revision,req.id)});},
  removeLogo:async(req,res)=>{parseInput(emptyQuery,req.query);const input=parseInput(logoDeleteSchema,req.body);success(res,'Company logo removed',{profile:await brandService.removeLogo(req.user.id,input.revision,req.id)});}
};
