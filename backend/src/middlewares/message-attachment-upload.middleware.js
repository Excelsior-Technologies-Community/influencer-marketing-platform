import multer from 'multer';
import {extname} from 'node:path';
import {ApiError} from '../utils/api-error.js';

const types={'image/png':['.png'],'image/jpeg':['.jpg','.jpeg'],'image/webp':['.webp'],'application/pdf':['.pdf']};
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:2,parts:3,fieldSize:20000},fileFilter:(req,file,cb)=>cb(types[file.mimetype]?.includes(extname(file.originalname).toLowerCase())?null:new ApiError(422,'Choose a PNG, JPEG, WebP or PDF with a matching extension'),true)}).single('file');

export function messageAttachmentUpload(req,res,next){
 upload(req,res,error=>{
  if(error?.code?.startsWith('LIMIT_'))return next(new ApiError(error.code==='LIMIT_FILE_SIZE'?413:422,error.code==='LIMIT_FILE_SIZE'?'Message attachments must be 5 MiB or smaller':'Upload one file with an optional message and a title only'));
  if(error&&['Unexpected end of form','Multipart: Boundary not found'].includes(error.message))return next(new ApiError(422,'Invalid message attachment upload'));
  next(error);
 });
}
