import {createRazorpayGateway} from '../src/services/razorpay.gateway.js';
const gateway=createRazorpayGateway();
try{
 gateway.assertReady();
 const result=await gateway.findOrders('configuration-check-no-receipt');
 if(!Array.isArray(result.items))throw new Error('Unexpected response');
 console.log('PASS: Razorpay Test Mode credentials authenticated against the Orders API. No order, payment or charge was created. Secrets were not displayed.');
}catch(error){
 console.error(error.status===503?'Payment setup incomplete: set Test Mode key ID, matching key secret and a webhook secret of at least 20 characters in backend/.env.':'Razorpay Test Mode authentication failed. Check the matching key pair and network access. No secrets were displayed.');process.exitCode=1;
}
