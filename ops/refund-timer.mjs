// Small scheduler only. The application and all records stay on ChatGPT Sites.
// Bind REFUND_JOB_TOKEN as an encrypted Worker secret; never put its value here.
export async function runRefundTimer(env,providerFetch=fetch){
 if(!env.REFUND_JOB_TOKEN)throw new Error('Refund timer credential is missing.');
 const response=await providerFetch('https://junkitout.in/api/internal/jobs/unassigned-refunds',{method:'POST',headers:{Authorization:'Bearer '+env.REFUND_JOB_TOKEN,'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(45000)});
 let result;try{result=await response.json();}catch{throw new Error('Refund job returned an invalid response.');}
 if(response.status!==200||result.success!==true){console.error(JSON.stringify({event:'refund_timer_failure',http:response.status,failed:Number(result.data?.failed)||0,reviewRequired:Number(result.data?.reviewRequired)||0}));throw new Error('Refund job requires retry or admin review.');}
 console.log(JSON.stringify({event:'refund_timer_completed',expired:Number(result.data?.expired)||0,processed:Number(result.data?.processed)||0,pending:Number(result.data?.pending)||0}));
 return {success:true};
}
export default {
 async scheduled(_controller,env,_ctx){await runRefundTimer(env);},
 // HTTP callers cannot trigger refunds; only the platform scheduler can.
 async fetch(){return new Response('Not found',{status:404});},
};
