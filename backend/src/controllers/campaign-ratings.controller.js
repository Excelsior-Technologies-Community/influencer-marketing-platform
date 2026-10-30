import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {success} from '../utils/response.js';

const reviewInput=z.strictObject({
 revieweeUserId:z.uuid(),
 rating:z.number().int().min(1).max(5),
 comment:z.string().trim().max(1000).optional().default('')
});
const campaignId=req=>parseInput(z.uuid(),req.params.id);

async function read(req,id){
 const [campaigns,targets,reviews]=await callProcedureSets('sp_campaign_reviews_read',[req.user.id,req.user.role,id]);
 return {
  campaign:campaigns[0],
  targets:targets.map(target=>({...target,alreadyReviewed:Boolean(target.alreadyReviewed)})),
  reviews:reviews.map(review=>({...review,rating:Number(review.rating),direction:review.direction}))
 };
}

export const campaignRatingsController={
 read:async(req,res)=>{
  parseInput(emptyQuery,req.query);
  success(res,'Campaign reviews',await read(req,campaignId(req)));
 },
 submit:async(req,res)=>{
  parseInput(emptyQuery,req.query);
  const input=parseInput(reviewInput,req.body),id=campaignId(req);
  const [review]=await callProcedure('sp_campaign_review_submit',[req.user.id,req.user.role,id,input.revieweeUserId,input.rating,input.comment,randomUUID(),req.id]);
  success(res,'Campaign review submitted',{review, ...await read(req,id)});
 }
};
