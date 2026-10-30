import {refreshDueCampaigns} from '../src/services/campaign-clock.service.js';
import {pool} from '../src/config/db.js';
try{console.log(`Refreshed ${await refreshDueCampaigns()} due campaigns (maximum 100 per run).`);}catch{console.error('Campaign status refresh failed. Check database readiness.');process.exitCode=1;}finally{await pool.end();}
