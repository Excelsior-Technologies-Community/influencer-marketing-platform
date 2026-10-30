import {createRazorpayGateway} from '../src/services/razorpay.gateway.js';
test('refund transport keeps a stable receipt/idempotency key and exact server amount',async()=>{
 const calls=[];const gateway=createRazorpayGateway({keyId:'rzp_test_Synthetic',keySecret:'synthetic',webhookSecret:'synthetic-webhook-secret',fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'rfnd_Synthetic'}),{status:200});}});
 const refund={id:'74df1554-b1b0-4bf0-af3f-001d8abce9c6',paymentId:'pay_Synthetic',amountMinor:'99999999999'};
 await gateway.createRefund(refund);await gateway.createRefund(refund);await gateway.getRefund('rfnd_Synthetic');await gateway.getPaymentRefunds('pay_Synthetic',100);
 expect(calls[0].options.headers['X-Refund-Idempotency']).toBe(refund.id);expect(calls[1].options.body).toBe(calls[0].options.body);expect(JSON.parse(calls[0].options.body)).toEqual({amount:99999999999,speed:'normal',receipt:refund.id});expect(calls[0].url).toBe('https://api.razorpay.com/v1/payments/pay_Synthetic/refund');expect(calls[2].options.method).toBe('GET');
 expect(calls[3].url).toBe('https://api.razorpay.com/v1/payments/pay_Synthetic/refunds?count=100&skip=100');
});
test('live credentials cannot send refund requests and provider failures expose no secrets',async()=>{
 let calls=0;const blocked=createRazorpayGateway({keyId:'rzp_live_Synthetic',keySecret:'private-test-value',webhookSecret:'synthetic-webhook-secret',fetcher:async()=>{calls++;}});
 await expect(blocked.createRefund({id:'test',paymentId:'pay_Test',amountMinor:'100'})).rejects.toMatchObject({status:503});expect(calls).toBe(0);
 const gateway=createRazorpayGateway({keyId:'rzp_test_Synthetic',keySecret:'private-test-value',webhookSecret:'synthetic-webhook-secret',fetcher:async()=>new Response('private-test-value',{status:500})});
 await expect(gateway.getRefund('rfnd_Test')).rejects.toMatchObject({status:502});
});

