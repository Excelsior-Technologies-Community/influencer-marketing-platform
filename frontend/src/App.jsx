import CampaignRefunds from './pages/brand/CampaignRefunds.jsx';
import PaymentReviews from './pages/admin/PaymentReviews.jsx';
import Wallet from './pages/campaigns/Wallet.jsx';
import CreatorRelease from './pages/brand/CreatorRelease.jsx';
import CampaignFunding from './pages/brand/CampaignFunding.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './services/api.js';
import CampaignWorkspaces from './pages/campaigns/CampaignWorkspaces.jsx';
import CampaignWorkspace from './pages/campaigns/CampaignWorkspace.jsx';
import CampaignReviews from './pages/campaigns/CampaignReviews.jsx';
import CampaignConversations from './pages/campaigns/CampaignConversations.jsx';
import NotificationInbox from './pages/notifications/NotificationInbox.jsx';
import CampaignLifecycle from './pages/campaigns/CampaignLifecycle.jsx';
import CampaignReview from './pages/campaigns/CampaignReview.jsx';
import CampaignReviewQueue from './pages/campaigns/CampaignReviewQueue.jsx';
import AuthPage from './pages/auth/AuthPage.jsx';
import ContentHistory from './pages/creator/ContentHistory.jsx';
import ContentSubmissions from './pages/creator/ContentSubmissions.jsx';
import CreatorApplications from './pages/creator/CreatorApplications.jsx';
import CreatorApplicationDetail from './pages/creator/CreatorApplicationDetail.jsx';
import CampaignDiscovery from './pages/creator/CampaignDiscovery.jsx';
import DiscoverCampaignDetail from './pages/creator/DiscoverCampaignDetail.jsx';
import CreatorProfile from './pages/creator/CreatorProfile.jsx';
import CreatorSocialAccounts from './pages/creator/CreatorSocialAccounts.jsx';
import CreatorMedia from './pages/creator/CreatorMedia.jsx';
import CreatorDashboard from './pages/creator/CreatorDashboard.jsx';
import CreatorAnalytics from './pages/creator/CreatorAnalytics.jsx';
import AdminUserActivity from './pages/super-admin/AdminUserActivity.jsx';
import AdminPanel from './pages/super-admin/AdminPanel.jsx';
import FinancialReports from './pages/analytics/FinancialReports.jsx';
import BrandContentSubmissions from './pages/brand/BrandContentSubmissions.jsx';
import BrandContentReview from './pages/brand/BrandContentReview.jsx';
import BrandApplicants from './pages/brand/BrandApplicants.jsx';
import BrandApplicantDetail from './pages/brand/BrandApplicantDetail.jsx';
import BrandPanel from './pages/brand/BrandPanel.jsx';
import CampaignDrafts from './pages/brand/CampaignDrafts.jsx';
import CampaignEditor from './pages/brand/CampaignEditor.jsx';
import CampaignPreparationPage from './pages/brand/CampaignPreparationPage.jsx';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { useAuth } from './store/auth-context.js';
import { rolePath } from './utils/role-path.js';

const roleMenus = {
  SUPER_ADMIN: { label: 'SUPER ADMIN', items: [['/notifications','Notifications','◉'],['/admin/payment-reviews','Payment reviews','◫'],['/admin','Dashboard','◫'],['/admin/analytics','User activity','◷'],['/admin/analytics/reports','Financial reports','▤'],['/admin/brands','Brands','▢'],['/admin/creators','Creators','☆'],['/admin/categories','Categories','☷'],['/admin/platforms','Platforms','◇'],['/admin/content-types','Content types','▤'],['/admin/campaign-reviews','Campaign reviews','☷'],['/admin/audit-logs','Audit history','◷']] },
  BRAND_ADMIN: { label: 'BRAND ADMIN', items: [['/notifications','Notifications','◉'],['/brand','Dashboard','◫'],['/brand/profile','Company profile','▢'],['/brand/billing','Billing details','▤'],['/brand/wallet','Wallet & payments','◫'],['/brand/campaigns','Campaigns','☷'],['/brand/analytics','Campaign analytics','▥'],['/brand/reports','Financial reports','▤'],['/brand/workspaces','My campaigns','◫']] },
  CREATOR: { label: 'CREATOR', items: [['/notifications','Notifications','◉'],['/creator','Dashboard','◫'],['/creator/analytics','Analytics','▥'],['/creator/reports','Earnings report','▤'],['/creator/wallet','Earnings & history','◫'],['/creator/campaigns','Discover campaigns','☷'],['/creator/applications','My applications','◷'],['/creator/workspaces','My campaigns','◫'],['/creator/profile','My profile','☆'],['/creator/social-accounts','Social accounts','◇'],['/creator/media','Media & documents','▤']] }
};

function Sidebar() {
  const { user, loading } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const menu = user ? roleMenus[user.role] : null;
  useEffect(() => setNavOpen(false), [location.pathname]);
  return <aside><AnalyticsTracker/><div className="sidebar-brand-row"><Link className="wordmark" to={user ? rolePath(user.role) : '/'}>influence<span>•</span></Link><button className="mobile-menu-toggle" type="button" aria-expanded={navOpen} aria-controls="primary-navigation" onClick={() => setNavOpen(open => !open)}>{navOpen ? 'Close menu' : 'Menu'}</button></div>
    {loading ? <p role="status">Loading your menu…</p> : <><div className="nav-label">{menu?.label || 'WELCOME'}</div><nav id="primary-navigation" className={navOpen ? 'is-open' : ''} aria-label="Main navigation">
      {menu ? menu.items.map(([path,label,icon]) => <NavLink key={path} to={path} end={!["/brand/campaigns","/admin/campaign-reviews","/creator/campaigns","/creator/applications","/brand/workspaces","/creator/workspaces"].includes(path)}><span aria-hidden="true">{icon}</span><span>{label}</span></NavLink>) : <><NavLink to="/" end>Home</NavLink><NavLink to="/login">Sign in</NavLink><NavLink to="/register">Create account</NavLink></>}
    </nav></>}
    <div className="sidebar-note">{user ? <><strong>{user.name}</strong><p>{menu?.label}</p></> : <p>Connect with brands.<br/>Create your next opportunity.</p>}</div>
  </aside>;
}

function SystemStatus() {
  const [state, setState] = useState('Checking API');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState('Checking API');
    api.get('/health', { signal: controller.signal }).then(() => setState('API online')).catch(() => { if (!controller.signal.aborted) setState('API unavailable'); });
    return () => controller.abort();
  }, [retry]);
  return <button className="status" onClick={() => setRetry(v => v + 1)} title="Check API again"><span className={state === 'API online' ? 'dot online' : 'dot'} />{state}</button>;
}
function newUuid(){return globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,letter=>{const value=Math.random()*16|0;return (letter==='x'?value:(value&3|8)).toString(16);});}
function analyticsSessionId(){try{let value=sessionStorage.getItem('influence-analytics-session');if(!value){value=newUuid();sessionStorage.setItem('influence-analytics-session',value);}return value;}catch{return newUuid();}}
function AnalyticsTracker(){
  const {user}=useAuth(),location=useLocation(),active=useRef(null);
  useEffect(()=>{
    const screen=location.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig,':id');
    const previous=active.current;
    if(previous&&user&&previous.userId===user.id&&previous.screen===screen)return;
    if(previous&&user&&previous.userId===user.id){
      const durationMs=Math.min(1800000,Math.max(0,Math.round(performance.now()-previous.startedAt)));
      api.post('/analytics/events',{eventId:previous.eventId,sessionId:previous.sessionId,screen:previous.screen,durationMs}).catch(()=>{});
    }
    active.current=user?{userId:user.id,sessionId:analyticsSessionId(),eventId:newUuid(),screen,startedAt:performance.now()}:null;
  },[user?.id,location.pathname]);
  return null;
}
function Overview() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking your session…</p>;
  if (user) return <Navigate to={rolePath(user.role)} replace/>;
  return <>
    <div className="eyebrow">INFLUENCER MARKETING</div>
    <div className="heading-row"><div><h1>Connect. Collaborate.<br/>Create.</h1><p className="lead">A place for brands and creators to build meaningful connections.</p></div></div>
    <section className="hero"><div><div className="eyebrow">BRANDS + CREATORS</div><h2>Your next collaboration starts here.</h2><p>Create your account and introduce your brand or share what makes your content unique.</p><Link className="button" to="/register">Get started <span>↗</span></Link></div><div className="orbit" aria-hidden="true"><div className="circle c1"/><div className="circle c2"/><div className="circle c3"/><span>i.</span><small>BRANDS + CREATORS</small></div></section>
  </>;
}
export default function App() {
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const roleTheme = user?.role || 'GUEST';
  async function signOut() { try { await logout(); setLogoutError(''); } catch { setLogoutError('Sign out failed. Please try again.'); } }
  return <div className="app" data-role={roleTheme}><Sidebar/><div className="content"><header><span>Influencer Marketing Platform</span><div className="header-actions"><SystemStatus/>{user?<button onClick={signOut}>Sign out</button>:<Link to="/login">Sign in ↗</Link>}</div></header>{logoutError && <p role="alert">{logoutError}</p>}<main><Routes><Route path="/" element={<Overview/>}/><Route path="/login" element={<AuthPage key="login" mode="login"/>}/><Route path="/register" element={<AuthPage key="register" mode="register"/>}/><Route path="/forgot-password" element={<AuthPage key="forgot" mode="forgot"/>}/><Route path="/reset-password" element={<AuthPage key="reset" mode="reset"/>}/><Route element={<ProtectedRoute/>}><Route path="/notifications" element={<NotificationInbox/>}/></Route><Route element={<ProtectedRoute role="SUPER_ADMIN"/>}><Route path="/admin/campaign-management/:id" element={<CampaignLifecycle/>}/><Route path="/admin/campaign-reviews" element={<CampaignReviewQueue/>}/><Route path="/admin/campaign-reviews/:id" element={<CampaignReview/>}/><Route path="/admin/payment-reviews" element={<PaymentReviews/>}/><Route path="/admin/analytics/reports" element={<FinancialReports/>}/><Route path="/admin/*" element={<AdminPanel/>}/></Route><Route element={<ProtectedRoute role="BRAND_ADMIN"/>}><Route path="/brand/*" element={<BrandPanel/>}/><Route path="/brand/wallet" element={<Wallet/>}/><Route path="/brand/workspaces" element={<CampaignWorkspaces/>}/><Route path="/brand/workspaces/:id/reviews" element={<CampaignReviews/>}/><Route path="/brand/workspaces/:id/conversations" element={<CampaignConversations/>}/><Route path="/brand/workspaces/:id/conversations/:applicationId" element={<CampaignConversations/>}/><Route path="/brand/workspaces/:id/submissions" element={<BrandContentSubmissions/>}/><Route path="/brand/workspaces/:id/submissions/:submissionId/review" element={<BrandContentReview/>}/><Route path="/brand/workspaces/:id" element={<CampaignWorkspace/>}/><Route path="/brand/campaigns" element={<CampaignDrafts/>}/><Route path="/brand/campaigns/:id/applicants" element={<BrandApplicants/>}/><Route path="/brand/campaigns/:id/applicants/:applicationId" element={<BrandApplicantDetail/>}/><Route path="/brand/campaigns/:id/refunds" element={<CampaignRefunds/>}/><Route path="/brand/campaigns/:id/earnings-release" element={<CreatorRelease/>}/><Route path="/brand/campaigns/:id/funding" element={<CampaignFunding/>}/><Route path="/brand/campaigns/:id/manage" element={<CampaignLifecycle/>}/><Route path="/brand/campaigns/:id/review" element={<CampaignReview/>}/><Route path="/brand/campaigns/new" element={<CampaignEditor/>}/><Route path="/brand/campaigns/:id" element={<CampaignEditor/>}/><Route path="/brand/campaigns/:id/preparation" element={<CampaignPreparationPage/>}/></Route><Route element={<ProtectedRoute role="CREATOR"/>}><Route path="/creator" element={<CreatorDashboard/>}/><Route path="/creator/analytics" element={<CreatorAnalytics/>}/><Route path="/creator/reports" element={<FinancialReports/>}/><Route path="/creator/wallet" element={<Wallet/>}/><Route path="/creator/workspaces" element={<CampaignWorkspaces/>}/><Route path="/creator/workspaces/:id/reviews" element={<CampaignReviews/>}/><Route path="/creator/workspaces/:id/conversations" element={<CampaignConversations/>}/><Route path="/creator/workspaces/:id/conversations/:applicationId" element={<CampaignConversations/>}/><Route path="/creator/workspaces/:id/submissions/:submissionId/history" element={<ContentHistory/>}/><Route path="/creator/workspaces/:id/submissions" element={<ContentSubmissions/>}/><Route path="/creator/workspaces/:id" element={<CampaignWorkspace/>}/><Route path="/creator/applications" element={<CreatorApplications/>}/><Route path="/creator/applications/:id" element={<CreatorApplicationDetail/>}/><Route path="/creator/campaigns" element={<CampaignDiscovery/>}/><Route path="/creator/campaigns/:id" element={<DiscoverCampaignDetail/>}/><Route path="/creator/dashboard" element={<Navigate to="/creator" replace/>}/><Route path="/creator/social-accounts" element={<CreatorSocialAccounts/>}/><Route path="/creator/profile" element={<CreatorProfile/>}/><Route path="/creator/media" element={<CreatorMedia/>}/></Route><Route path="*" element={<><h1>Page not found.</h1><Link to="/">Return to overview</Link></>}/></Routes></main><footer><span>Built for brand–creator partnerships.</span><a href="/api-docs/" target="_blank" rel="noreferrer">API documentation ↗</a></footer></div></div>;
}


