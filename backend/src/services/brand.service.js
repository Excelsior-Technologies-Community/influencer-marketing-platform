import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { brandRepository as repository } from '../repositories/brand.repository.js';
import { emptyDetails } from '../validators/brand.validator.js';
import { ApiError } from '../utils/api-error.js';
const signature=buffer=>buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':buffer[0]===255&&buffer[1]===216&&buffer[2]===255?'jpeg':buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'?'webp':null;
function animatedContainer(buffer,format){
  if(format==='png')for(let offset=8;offset+8<=buffer.length;){const size=buffer.readUInt32BE(offset),type=buffer.subarray(offset+4,offset+8).toString('ascii');if(type==='acTL')return true;if(offset+12+size>buffer.length)break;offset+=12+size;}
  if(format==='webp')for(let offset=12;offset+8<=buffer.length;){const type=buffer.subarray(offset,offset+4).toString('ascii'),size=buffer.readUInt32LE(offset+4);if(type==='ANIM'||type==='ANMF'||(type==='VP8X'&&size>=1&&offset+8<buffer.length&&(buffer[offset+8]&2)))return true;if(offset+8+size>buffer.length)break;offset+=8+size+(size%2);}
  return false;
}
function profileDto(rows){
  if(!rows.length)throw new ApiError(404,'Brand profile not found');
  const row=rows[0],defaults=emptyDetails(),details=row.details||{};
  return {id:row.id,userId:row.userId,accountName:row.accountName,accountEmail:row.accountEmail,status:row.status,companyName:row.companyName,website:row.website,industry:row.industry,description:row.description,contactName:details.contactName||null,contactEmail:details.contactEmail||null,phone:details.phone||null,location:details.location||null,socialLinks:{...defaults.socialLinks,...details.socialLinks},billing:{...defaults.billing,...details.billing},revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt,logoRevision:row.logoRevision,logo:row.logoHash?{mimeType:row.logoMime,hash:row.logoHash,size:row.logoSize,width:row.logoWidth,height:row.logoHeight,updatedAt:row.logoUpdatedAt}:null};
}
export function profileReadiness(profile){
  const checks=[['companyName','Company name',Boolean(profile.companyName)],['contactEmail','Contact email',Boolean(profile.contactEmail)],['phone','Phone',Boolean(profile.phone)],['website','Website',Boolean(profile.website)],['industry','Industry',Boolean(profile.industry)],['description','Description',Boolean(profile.description)],['location','Location',Boolean(profile.location)],['logo','Company logo',Boolean(profile.logo)]];
  const completed=checks.filter(([, ,value])=>value).length;
  return {completed,total:checks.length,percent:Math.round(completed/checks.length*100),missing:checks.filter(([, ,value])=>!value).map(([key,label])=>({key,label})),billingReady:Boolean(profile.billing.name&&profile.billing.email&&profile.billing.addressLine1&&profile.billing.city&&profile.billing.country)};
}
export const brandService={
  profile:async actor=>profileDto(await repository.get(actor)),
  async dashboard(actor){const [profile,stats]=await Promise.all([this.profile(actor),repository.dashboard(actor)]);return {profile,readiness:profileReadiness(profile),campaigns:Object.fromEntries(Object.entries(stats).map(([key,value])=>[key,Number(value)]))};},
  update:async(actor,input,requestId)=>{
    const {companyName,website,industry,description,revision,...details}=input;
    return profileDto(await repository.update([actor,companyName,website,industry,description,JSON.stringify(details),revision,requestId]));
  },
  async logo(actor){const rows=await repository.logo(actor);if(!rows.length)throw new ApiError(404,'Company logo not found');return rows[0];},
  async upload(actor,file,revision,requestId){
    if(!file)throw new ApiError(422,'Choose a logo image');
    const format=signature(file.buffer),mimeFormats={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'};
    if(!format||format!==mimeFormats[file.mimetype])throw new ApiError(422,'File contents do not match the declared image type');
    if(animatedContainer(file.buffer,format))throw new ApiError(422,'Animated logos are not supported');
    let output;
    try{
      const image=sharp(file.buffer,{limitInputPixels:10000000,failOn:'warning'}),metadata=await image.metadata();
      if(metadata.format!==format||!metadata.width||!metadata.height||metadata.width>8192||metadata.height>8192||(metadata.pages||1)>1)throw new Error('Unsupported image');
      output=await image.rotate().resize(512,512,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
    }catch{throw new ApiError(422,'Choose a valid, non-animated PNG, JPEG or WebP image up to 10 million pixels');}
    const hash=createHash('sha256').update(output.data).digest('hex');
    return profileDto(await repository.saveLogo([actor,output.data,hash,output.info.width,output.info.height,revision,requestId]));
  },
  removeLogo:async(actor,revision,requestId)=>profileDto(await repository.removeLogo([actor,revision,requestId]))
};
