import {createHmac,timingSafeEqual} from 'node:crypto';
export class VoiceError extends Error {constructor(message:string,public status=503){super(message);}}
export function voiceConfig() {
 const sid=process.env.EXOTEL_ACCOUNT_SID?.trim()||'';
 const key=process.env.EXOTEL_API_KEY?.trim()||'';
 const token=process.env.EXOTEL_API_TOKEN?.trim()||'';
 const callerId=(process.env.EXOTEL_CALLER_ID||'').replace(/[\s-]/g,'');
 const host=process.env.EXOTEL_HOST?.trim()||'';
 const enabled=process.env.EXOTEL_ENABLED?.trim()==='true';
 const ready=Boolean(/^[\w-]+$/.test(sid) && key && !key.includes(':') && token && /^\+?\d{8,15}$/.test(callerId) && ['api.exotel.com','api.in.exotel.com'].includes(host) && (process.env.JWT_SECRET?.trim().length||0)>=32);
 return {sid,key,token,callerId,host,enabled,ready};
}
export function mobileNumber(value:string) {
 const v=value.replace(/[\s()-]/g,'');
 const digits=v.replace(/^\+91|^91(?=\d{10}$)|^0(?=\d{10}$)/,'');
 if(!/^[6-9]\d{9}$/.test(digits))throw new VoiceError('A valid registered Indian mobile number is required.',400);
 return '+91'+digits;
}
export function callbackToken(id:string,scope:'pickup'|'support'='pickup') {
 const key=process.env.JWT_SECRET?.trim();
 if(!key || key.length<32)throw new VoiceError('Calling is not configured.');
 return createHmac('sha256',key).update((scope==='support'?'junkitout:exotel:support-callback:v1:':'junkitout:exotel:callback:v1:')+id).digest('hex');
}
export function validCallbackToken(id:string,token:string,scope:'pickup'|'support'='pickup') {
 if(!/^[a-f0-9]{64}$/.test(token)) return false;
 try{return timingSafeEqual(Buffer.from(token),Buffer.from(callbackToken(id,scope)));}catch{return false;}
}
export async function exotelRequest(path:string,body?:URLSearchParams,timeoutMs=15000) {
 const c=voiceConfig();
 if(!c.ready)throw new VoiceError('Calling setup is incomplete. Please contact support.');
 let response:Response;
 try {response=await fetch(`https://${c.host}/v1/Accounts/${encodeURIComponent(c.sid)}/${path}`,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(c.key+':'+c.token).toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:body?.toString(),signal:AbortSignal.timeout(timeoutMs),redirect:'manual',cache:'no-store'});}catch(error){console.error(JSON.stringify({event:'voice.provider.transport_failed',method:body?'POST':'GET',errorType:error instanceof Error?error.name:'UnknownError'}));throw new VoiceError('Call request could not be confirmed. Check call status before trying again.');}
 // Workers accept manual/follow, not redirect:error. Never follow provider redirects with credentials.
 if(response.status>=300 && response.status<400){console.error(JSON.stringify({event:'voice.provider.redirect_rejected',status:response.status}));throw new VoiceError('Calling provider redirected the request. Contact support to check the account region.');}
 if(!response.ok)throw new VoiceError(response.status===401 || response.status===403 ? 'Calling account authorization failed. Contact support.' : 'Calling provider is unavailable. Check call status before retrying.');
 try{return await response.json();}catch{throw new VoiceError('Call request could not be confirmed. Check call status before retrying.');}
}
export async function connectNumbers(input:{id:string;from:string;to:string;scope?:'pickup'|'support'}) {
 const c=voiceConfig();
 if(!c.enabled || !c.ready)throw new VoiceError('Calling has not been activated yet.');
 const callback=new URL('/api/voice/exotel/callback','https://junkitout.in');
 callback.searchParams.set('id',input.id);callback.searchParams.set('token',callbackToken(input.id,input.scope));
 if(input.scope==='support')callback.searchParams.set('scope','support');
 const params=new URLSearchParams({From:mobileNumber(input.from),To:mobileNumber(input.to),CallerId:c.callerId,CallType:'trans',TimeLimit:'600',TimeOut:'25',Record:'true',CustomField:input.id,StatusCallback:callback.toString(),StatusCallbackContentType:'application/json'});
 params.append('StatusCallbackEvents[0]','terminal');
 const data=await exotelRequest('Calls/connect.json',params);
 if(!data.Call?.Sid || !/^[a-zA-Z0-9-]{8,128}$/.test(data.Call.Sid))throw new VoiceError('Call request could not be confirmed. Check call status before retrying.');
 return {sid:data.Call.Sid as string,status:callStatus(data.Call.Status)};
}
const statuses=['queued','in-progress','completed','failed','busy','no-answer','canceled'];
export function callStatus(value:unknown) {return typeof value==='string' && statuses.includes(value)?value:'UNKNOWN';}
export async function getCallDetails(sid:string) {
 if(!/^[a-zA-Z0-9-]{8,128}$/.test(sid))throw new VoiceError('Invalid call reference.',400);
 const data=await exotelRequest(`Calls/${encodeURIComponent(sid)}.json`);
 const c=voiceConfig();
 if(data.Call?.Sid!==sid || data.Call?.AccountSid!==c.sid)throw new VoiceError('Call status could not be verified.');
 return {status:callStatus(data.Call.Status),duration:Number.isFinite(Number(data.Call.Duration))?Math.max(0,Number(data.Call.Duration)):null};
}

/** Accounts may return the documented BalanceData object or the older Balance.Amount envelope. */
export function parseExotelBalance(result: any) {
 const modern=result?.Account?.BalanceData;
 const legacy=result?.Balance;
 const value=modern?.Balance ?? legacy?.Amount;
 if((typeof value!=='number' && typeof value!=='string') || String(value).trim()==='' || !Number.isFinite(Number(value)))throw new VoiceError('Account balance could not be verified.');
 const currency=modern?.Currency ?? legacy?.Currency;
 return {amount:Number(value),currency:typeof currency==='string' && /^[A-Z]{3}$/.test(currency)?currency:null};
}
