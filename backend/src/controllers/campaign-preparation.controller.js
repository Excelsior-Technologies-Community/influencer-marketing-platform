import {campaignPreparationService as service} from '../services/campaign-preparation.service.js';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {campaignIdSchema} from '../validators/campaign.validator.js';
import {campaignScheduleSchema,campaignFileCreate,campaignFileReplace,campaignFileDelete} from '../validators/campaign-preparation.validator.js';
import {success} from '../utils/response.js';
function ids(req,file=false){parseInput(emptyQuery,req.query);return [parseInput(campaignIdSchema,req.params.id),...(file?[parseInput(campaignIdSchema,req.params.fileId)]:[])];}
export const preparationController={
  get:async(req,res)=>success(res,'Campaign schedule and files',await service.get(req.user.id,...ids(req))),
  readiness:async(req,res)=>success(res,'Saved campaign checks',await service.readiness(req.user.id,...ids(req))),
  schedule:async(req,res)=>success(res,'Campaign schedule saved',await service.saveSchedule(req.user.id,...ids(req),parseInput(campaignScheduleSchema,req.body),req.id)),
  upload:async(req,res)=>{const replacing=req.method==='PUT',[id,fileId]=ids(req,replacing),input=parseInput(replacing?campaignFileReplace:campaignFileCreate,req.body),result=await service.saveFile(req.user.id,id,fileId||null,input,req.file,req.id);res.status(replacing?200:201);success(res,'Campaign file saved',result);},
  remove:async(req,res)=>success(res,'Campaign file removed',await service.removeFile(req.user.id,...ids(req,true),parseInput(campaignFileDelete,req.body).revision,req.id)),
  download:async(req,res)=>{const file=await service.file(req.user.id,...ids(req,true));res.setHeader('Content-Type',file.mimeType);res.setHeader('Content-Length',file.fileContent.length);res.setHeader('Content-Disposition',`${file.mimeType==='application/pdf'?'attachment':'inline'}; filename="campaign-${file.kind.toLowerCase()}-${file.id}.${file.mimeType==='application/pdf'?'pdf':'webp'}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('X-Content-Type-Options','nosniff');res.send(file.fileContent);}
};
