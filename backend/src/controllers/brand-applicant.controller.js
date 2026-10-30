import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {applicantQuery,applicantDecision} from '../validators/brand-applicant.validator.js';
import {brandApplicantService as service} from '../services/brand-applicant.service.js';
import {success} from '../utils/response.js';
const uuid=x=>parseInput(z.uuid(),x);
function ids(req){parseInput(emptyQuery,req.query);return [uuid(req.params.id),uuid(req.params.applicationId)];}
export const brandApplicantController={
 list:async(req,res)=>{const r=await service.list(req.user.id,uuid(req.params.id),parseInput(applicantQuery,req.query));success(res,'Campaign applicants',{campaign:r.campaign,items:r.items},r.meta);},
 get:async(req,res)=>success(res,'Campaign applicant',await service.get(req.user.id,...ids(req))),
 decide:async(req,res)=>success(res,'Applicant decision saved',await service.decide(req.user.id,...ids(req),parseInput(applicantDecision,req.body),req.id)),
 file:async(req,res)=>{const file=await service.file(req.user.id,...ids(req),uuid(req.params.fileId),req.id);res.setHeader('Content-Type',file.mimeType);res.setHeader('Content-Length',file.fileContent.length);res.setHeader('Content-Disposition',`attachment; filename="applicant-${file.kind.toLowerCase()}-${file.id}.${file.mimeType==='application/pdf'?'pdf':'webp'}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('X-Content-Type-Options','nosniff');res.send(file.fileContent);}
};
