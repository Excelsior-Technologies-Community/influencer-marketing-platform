import multer from 'multer';
import { extname } from 'node:path';
import { ApiError } from '../utils/api-error.js';
const extensions={'image/png':['.png'],'image/jpeg':['.jpg','.jpeg'],'image/webp':['.webp']};
export const logoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:1,parts:2,fieldSize:32},fileFilter:(req,file,callback)=>{
  if(!extensions[file.mimetype]?.includes(extname(file.originalname).toLowerCase()))return callback(new ApiError(422,'Choose a PNG, JPEG or WebP file with a matching extension'));
  callback(null,true);
}}).single('logo');
