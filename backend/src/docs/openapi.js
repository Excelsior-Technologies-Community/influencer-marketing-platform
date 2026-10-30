import {refundPaths} from './campaign-refund.openapi.js';
import {campaignRatingsPaths} from './campaign-ratings.openapi.js';
import {campaignConversationPaths} from './campaign-conversations.openapi.js';
import {campaignAnalyticsPaths} from './campaign-analytics.openapi.js';
import {activityAnalyticsPaths} from './activity-analytics.openapi.js';
import {analyticsReportPaths} from './analytics-report.openapi.js';
import {notificationPaths} from './notifications.openapi.js';
import {releasePaths} from './creator-release.openapi.js';
import {walletPaths} from './wallet.openapi.js';
import {fundingPaths} from './campaign-funding.openapi.js';
import {completionPaths} from './content-completion.openapi.js';
import {brandContentPaths} from './brand-content-review.openapi.js';
import {historyPaths} from './content-history.openapi.js';
import {contentPaths} from './content-submission.openapi.js';
import {workspacePaths} from './campaign-workspace.openapi.js';
import {applicantPaths} from './brand-applicant.openapi.js';
import {applicationPaths} from './campaign-application.openapi.js';
import {discoveryPaths} from './campaign-discovery.openapi.js';
import {lifecyclePaths} from './campaign-lifecycle.openapi.js';
import { reviewPaths } from './campaign-review.openapi.js';
import { authPaths } from './auth.openapi.js';
import { adminPaths } from './admin.openapi.js';
import { brandPaths } from './brand.openapi.js';
import { creatorPaths } from './creator.openapi.js';
import { creatorSocialPaths } from './creator-social.openapi.js';
import { creatorAssetPaths } from './creator-assets.openapi.js';
import { creatorDashboardPaths } from './creator-dashboard.openapi.js';
import { campaignPaths } from './campaign.openapi.js';
import { preparationPaths } from './campaign-preparation.openapi.js';
const error = { type: 'object', required: ['success', 'message', 'errors'], properties: { success: { type: 'boolean', enum: [false] }, message: { type: 'string' }, errors: { type: 'array', items: { type: 'object' } } } };
const success = { type: 'object', required: ['success', 'message', 'data', 'meta'], properties: { success: { type: 'boolean', enum: [true] }, message: { type: 'string' }, data: { type: 'object', additionalProperties: true }, meta: { type: 'object' } } };
const response = (description, schema) => ({ description, content: { 'application/json': { schema } } });
export const openapi = {
  openapi: '3.0.3',
  info: { title: 'Influencer Marketing API', version: '0.9.4', description: 'Local workflows for authentication, Brand and Creator profiles, campaigns, Creator applications, content review, Test Mode financial workflows, reviews and messaging, notifications, analytics and reports. Local configuration, product workflows and deployment boundaries are documented in the repository guides.' },
  servers: [{ url: '/api/v1' }],
  tags: [{ name: 'System' }, { name: 'Authentication' },{name:'Super Admin'},{name:'Brand'},{name:'Creator profile'},{name:'Analytics'},{name:'Reviews'},{name:'Messaging'},{name:'Notifications'}],
  components: { schemas: { Success: success, Error: error }, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, refreshCookie: { type: 'apiKey', in: 'cookie', name: 'influence_refresh' } } },
  paths: {
    ...refundPaths,...walletPaths,...releasePaths,...campaignRatingsPaths,...campaignConversationPaths,...campaignAnalyticsPaths,...activityAnalyticsPaths,...analyticsReportPaths,...notificationPaths,
    ...fundingPaths,
    ...completionPaths,
    ...authPaths,
    ...adminPaths,
    ...brandPaths,
    ...creatorPaths,
    ...creatorSocialPaths,
    ...creatorAssetPaths,
    ...creatorDashboardPaths,
    ...campaignPaths,
    ...preparationPaths,
    ...reviewPaths,
    ...lifecyclePaths,
    ...discoveryPaths,
    ...applicationPaths,
    ...applicantPaths,
    ...workspacePaths,
    ...contentPaths,
    ...historyPaths,
    ...brandContentPaths,
    '/health': { get: { operationId: 'getLiveness', tags: ['System'], summary: 'Check API process', security: [], responses: { 200: response('API is running', success), 429: response('Too many requests', error) } } },
    '/health/ready': { get: { operationId: 'getReadiness', tags: ['System'], summary: 'Check MySQL connectivity', security: [], responses: { 200: response('Database connected', success), 503: response('Database unavailable', error), 429: response('Too many requests', error) } } }
  }
};

