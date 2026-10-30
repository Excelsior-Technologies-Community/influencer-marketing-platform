import { creatorRepository } from '../repositories/creator.repository.js';
import { profileDto } from './creator.service.js';
import { accountDto } from './creator-social.service.js';

export function dashboardDto([profiles,categories,accounts,assets,availability]){
  const profile=profileDto([profiles,categories]),socialAccounts=accounts.map(accountDto),photo=assets.find(row=>row.kind==='PHOTO')||null;
  const portfolio=assets.filter(row=>row.kind==='PORTFOLIO'),verificationFileCount=assets.filter(row=>row.kind==='VERIFICATION').length;
  const activeCategoryCount=profile.categories.filter(row=>row.isAvailable).length,activeSocialCount=socialAccounts.filter(row=>row.isAvailable).length;
  const checks=[
    ['bio','Introduction',Boolean(profile.bio),'/creator/profile'],
    ['location','Location',Boolean(profile.location),'/creator/profile'],
    ['languages','Languages',profile.languages.length>0,'/creator/profile'],
    ['skills','Skills',profile.skills.length>0,'/creator/profile'],
    ['categories','Active content category',activeCategoryCount>0,'/creator/profile'],
    ['photo','Profile photo',Boolean(photo),'/creator/media'],
    ['social','Active social platform profile',activeSocialCount>0,'/creator/social-accounts'],
    ['portfolio','Portfolio sample',portfolio.length>0,'/creator/media']
  ].map(([key,label,complete,path])=>({key,label,complete,path}));
  const completed=checks.filter(row=>row.complete).length,missing=checks.filter(row=>!row.complete);
  const reported=socialAccounts.filter(row=>row.followersCount!==null);
  const status=profile.verificationStatus;
  const guidance={PENDING:verificationFileCount?'Your evidence is available for Super Admin review.':'Add supporting documents for Super Admin review.',UNDER_REVIEW:'Super Admin has marked your account as under review.',VERIFIED:'Your creator account has been verified by Super Admin.',REJECTED:'Super Admin rejected the verification. Update your supporting documents as needed.'}[status];
  return {
    profile,readiness:{completed,total:checks.length,percent:Math.round(completed/checks.length*100),checks,missing},
    social:{accounts:socialAccounts,count:socialAccounts.length,activeCount:activeSocialCount,reportedAudienceTotal:reported.length?reported.reduce((sum,row)=>sum+row.followersCount,0):null,accountsWithReportedAudience:reported.length,metricsSource:'MANUAL',audienceNote:'Sum of self-reported account counts; audiences may overlap. This is not unique reach or provider-verified data.'},
    media:{photo,portfolio,portfolioCount:portfolio.length,verificationFileCount},
    verification:{status,evidenceCount:verificationFileCount,guidance,note:'Profile completeness and uploaded evidence do not change verification status.'},
    catalog:{availableCategoryCount:Number(availability[0].availableCategoryCount),availablePlatformCount:Number(availability[0].availablePlatformCount)},
    nextSteps:[...missing,...(!verificationFileCount&&['PENDING','REJECTED'].includes(status)?[{key:'evidence',label:'Add verification evidence',complete:false,path:'/creator/media'}]:[])]
  };
}
export const creatorDashboardService={get:async actor=>{
  const [sets,roleDashboard]=await Promise.all([creatorRepository.dashboard(actor),creatorRepository.roleDashboard(actor)]);
  const result=dashboardDto(sets);
  result.campaigns=Object.fromEntries(Object.entries(roleDashboard).map(([key,value])=>[key,Number(value)]));
  return result;
}};
