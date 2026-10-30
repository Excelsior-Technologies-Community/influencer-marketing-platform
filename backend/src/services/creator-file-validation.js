import sharp from 'sharp';
import { PDFDocument,PDFDict,PDFArray,PDFStream,PDFName } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { ApiError } from '../utils/api-error.js';
const signature=buffer=>buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':buffer[0]===255&&buffer[1]===216&&buffer[2]===255?'jpeg':buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'?'webp':null;
const blocked=new Set(['JS','JavaScript','AA','OpenAction','Launch','EmbeddedFiles','EmbeddedFile','RichMedia','XFA','AcroForm','URI','SubmitForm','ImportData','GoToR','GoToE','Sound','Movie','Rendition','Filespec']);
async function pdf(buffer){
  if(buffer.subarray(0,5).toString()!=='%PDF-'||!buffer.subarray(-1024).toString('latin1').trimEnd().endsWith('%%EOF'))throw new Error('Invalid PDF');
  const document=await PDFDocument.load(buffer,{updateMetadata:false,throwOnInvalidObject:true});
  if(document.isEncrypted||document.getPageCount()<1||document.getPageCount()>20)throw new Error('Unsupported PDF');
  let nodes=0;const seen=new Set();
  function inspect(object,depth=0){
    if(!object||seen.has(object))return;seen.add(object);if(++nodes>20000||depth>40)throw new Error('Complex PDF');
    if(object instanceof PDFName&&blocked.has(object.decodeText()))throw new Error('Active PDF');
    if(object instanceof PDFStream)inspect(object.dict,depth+1);
    if(object instanceof PDFDict)for(const [key,value] of object.entries()){if(blocked.has(key.decodeText()))throw new Error('Active PDF');inspect(value,depth+1);}
    if(object instanceof PDFArray)for(let index=0;index<object.size();index++)inspect(object.get(index),depth+1);
  }
  for(const [,object] of document.context.enumerateIndirectObjects())inspect(object);
  // Copy page content into a new document instead of retaining metadata/catalog extras.
  const clean=await PDFDocument.create();const pages=await clean.copyPages(document,document.getPageIndices());for(const page of pages)clean.addPage(page);
  return {bytes:Buffer.from(await clean.save()),mimeType:'application/pdf',width:null,height:null,pageCount:pages.length};
}
export async function validateCreatorFile(file,kind){
  if(!file)throw new ApiError(422,'Choose a file to upload');
  if(file.size>(kind==='PHOTO'?2:5)*1024*1024)throw new ApiError(413,kind==='PHOTO'?'Profile photos must be 2 MiB or smaller':'Files must be 5 MiB or smaller');
  let output;
  if(file.mimetype==='application/pdf'){
    if(kind==='PHOTO')throw new ApiError(422,'Profile photos must be PNG, JPEG or WebP images');
    try{output=await pdf(file.buffer);}catch{throw new ApiError(422,'Choose a valid, unencrypted PDF with 1–20 pages and no forms, actions, links or embedded files');}
  }else{
    try{
      const format=signature(file.buffer);if(!format||format!==({'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'})[file.mimetype])throw new Error('Type mismatch');
      // Reject animation even when the decoder would otherwise read only the first frame.
      if(format==='png')for(let pos=8;pos+12<=file.buffer.length;){const length=file.buffer.readUInt32BE(pos);if(file.buffer.subarray(pos+4,pos+8).toString()==='acTL')throw new Error('Animated');pos+=12+length;}
      if(format==='webp')for(let pos=12;pos+8<=file.buffer.length;){const length=file.buffer.readUInt32LE(pos+4),type=file.buffer.subarray(pos,pos+4).toString();if(type==='ANIM'||type==='ANMF'||(type==='VP8X'&&(file.buffer[pos+8]&2)))throw new Error('Animated');pos+=8+length+(length%2);}
      const image=sharp(file.buffer,{limitInputPixels:10000000,failOn:'warning'}),meta=await image.metadata();if(meta.format!==format||!meta.width||!meta.height||meta.width>8192||meta.height>8192||(meta.pages||1)>1)throw new Error('Invalid image');
      const size=kind==='PHOTO'?512:2000,result=await image.rotate().resize(size,size,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});output={bytes:result.data,mimeType:'image/webp',width:result.info.width,height:result.info.height,pageCount:null};
    }catch{throw new ApiError(422,'Choose a valid non-animated PNG, JPEG or WebP image up to 10 million pixels');}
  }
  if(output.bytes.length>5*1024*1024)throw new ApiError(413,'Processed file is too large');
  return {...output,hash:createHash('sha256').update(output.bytes).digest('hex')};
}
