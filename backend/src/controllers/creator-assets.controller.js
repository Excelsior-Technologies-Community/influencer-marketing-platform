import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { callProcedure,callProcedureSets } from '../repositories/procedure.repository.js';
import { validateCreatorFile } from '../services/creator-file-validation.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { creatorEmptyQuery } from '../validators/creator.validator.js';
import { ApiError } from '../utils/api-error.js';
import { success } from '../utils/response.js';
const idSchema=z.uuid(),title=z.string().trim().min(2).max(120),revision=z.number().int().min(1).max(2147483646);
const uploadRevision=z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(revision);
const createSchema=z.strictObject({kind:z.enum(['PHOTO','PORTFOLIO','VERIFICATION']),title});
const updateSchema=z.strictObject({title,revision:uploadRevision});
const removeSchema=z.strictObject({revision});
const metadata=({fileContent,...row})=>row;
async function read(req,admin=false,download=false){
  parseInput(creatorEmptyQuery,req.query);const creator=admin?parseInput(idSchema,req.params.id):null;
  const fileId=download?parseInput(idSchema,admin?req.params.fileId:req.params.id):null;
  return callProcedureSets('sp_get_creator_assets',[req.user.id,creator,fileId,download,req.id]);
}
async function list(req,res,admin=false){const [rows,status]=await read(req,admin);success(res,admin?'Verification evidence':'Your creator files',{items:rows.map(metadata),verificationStatus:status[0].verificationStatus});}
async function download(req,res,admin=false){const [[file]]=await read(req,admin,true);if(!file)throw new ApiError(404,'File not found');
  res.setHeader('Content-Type',file.mimeType);res.setHeader('Content-Length',file.fileContent.length);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
  res.setHeader('Content-Disposition',`${file.mimeType==='application/pdf'?'attachment':'inline'}; filename="${file.kind.toLowerCase()}-${file.id}.${file.mimeType==='application/pdf'?'pdf':'webp'}"`);res.send(file.fileContent);
}
export const creatorAssetsController={
  list:(req,res)=>list(req,res),download:(req,res)=>download(req,res),
  adminList:(req,res)=>list(req,res,true),adminDownload:(req,res)=>download(req,res,true),
  async upload(req,res){
    parseInput(creatorEmptyQuery,req.query);const replacing=req.method==='PUT',input=parseInput(replacing?updateSchema:createSchema,req.body),id=replacing?parseInput(idSchema,req.params.id):randomUUID();let kind=input.kind;
    if(replacing){const [rows]=await callProcedureSets('sp_get_creator_assets',[req.user.id,null,id,false,req.id]);if(!rows.length)throw new ApiError(404,'File not found');kind=rows[0].kind;}
    const file=await validateCreatorFile(req.file,kind);
    await callProcedure('sp_save_creator_asset',[req.user.id,id,kind,input.title,file.bytes,file.mimeType,file.hash,file.width,file.height,file.pageCount,input.revision??null,req.id]);
    res.status(replacing?200:201);await list(req,res);
  },
  async remove(req,res){parseInput(creatorEmptyQuery,req.query);const id=parseInput(idSchema,req.params.id),input=parseInput(removeSchema,req.body);await callProcedure('sp_delete_creator_asset',[req.user.id,id,input.revision,req.id]);await list(req,res);}
};
