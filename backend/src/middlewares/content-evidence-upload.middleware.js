import multer from 'multer';
import {extname} from 'node:path';
import {ApiError} from '../utils/api-error.js';
const types={'image/png':['.png'],'image/jpeg':['.jpg','.jpeg'],'image/webp':['.webp'],'application/pdf':['.pdf']};
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:3,parts:4,fieldSize:2048},fileFilter:(req,file,cb)=>cb(types[file.mimetype]?.includes(extname(file.originalname).toLowerCase())?null:new ApiError(422,'Choose a PNG, JPEG, WebP or PDF with a matching extension'),true)}).single('file');
export function contentEvidenceUpload(req,res,next){upload(req,res,error=>{if(error?.code?.startsWith('LIMIT_'))return next(new ApiError(error.code==='LIMIT_FILE_SIZE'?413:422,error.code==='LIMIT_FILE_SIZE'?'Evidence files must be 5 MiB or smaller':'Upload one file with title, version and reason only'));if(error&&['Unexpected end of form','Multipart: Boundary not found'].includes(error.message))return next(new ApiError(422,'Invalid multipart upload'));next(error);});}
