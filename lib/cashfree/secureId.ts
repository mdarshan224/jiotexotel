import 'server-only';
export class SecureIdError extends Error {constructor(message:string,public status=503){super(message);}}
export function secureIdConfig(){
 const clientId=process.env.CASHFREE_SECURE_ID_CLIENT_ID?.trim()||'';
 const clientSecret=process.env.CASHFREE_SECURE_ID_CLIENT_SECRET?.trim()||'';
 const publicKey=(process.env.CASHFREE_SECURE_ID_PUBLIC_KEY||'').trim().replace(/\\n/g,'\n');
 const mode=process.env.CASHFREE_SECURE_ID_MODE?.trim()||'production';
 const template=process.env.CASHFREE_SECURE_ID_TEMPLATE?.trim()||'Aadhaar_verification';
 const ready=!!clientId&&!!clientSecret&&publicKey.includes('-----BEGIN PUBLIC KEY-----')&&['production','sandbox'].includes(mode)&&/^[\w -]{1,100}$/.test(template);
 return {clientId,clientSecret,publicKey,mode,template,ready};
}
export async function secureIdSignature(clientId:string,publicKey:string,now=Date.now()){
 try{
  const bytes=Buffer.from(publicKey.replace(/-----[\w ]+-----|\s/g,''),'base64');
  const key=await crypto.subtle.importKey('spki',bytes,{name:'RSA-OAEP',hash:'SHA-1'},false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'RSA-OAEP'},key,new TextEncoder().encode(clientId+'.'+Math.floor(now/1000)));
  return Buffer.from(encrypted).toString('base64');
 }catch{throw new SecureIdError('Identity verification public key configuration needs attention.');}
}
export function secureIdLink(value:unknown,mode=secureIdConfig().mode){
 if(typeof value!=='string')return null;
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname===(mode==='sandbox'?'forms-test.cashfree.com':'forms.cashfree.com')&&!url.username&&!url.password&&(!url.port||url.port==='443')?url.href:null;}catch{return null;}
}
export async function secureIdRequest(path:string,body?:Record<string,unknown>){
 const c=secureIdConfig();if(!c.ready)throw new SecureIdError('Identity verification setup is pending. Please contact dispatch.');
 if(!/^(?:form(?:\?verificationID=[A-Za-z0-9_-]+)?|digilocker(?:\?verification_id=[A-Za-z0-9_-]+)?|digilocker\/document\/AADHAAR\?verification_id=[A-Za-z0-9_-]+|pan|bank-account\/sync|ifsc|driving-license|vehicle-rc|name-match)$/.test(path))throw new SecureIdError('Invalid verification request.',400);
 const signature=await secureIdSignature(c.clientId,c.publicKey);
 let response:Response;
 try{response=await fetch(`https://${c.mode==='sandbox'?'sandbox':'api'}.cashfree.com/verification/${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-client-id':c.clientId,'x-client-secret':c.clientSecret,'x-cf-signature':signature,'x-api-version':'2022-09-13'},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(15000),cache:'no-store'});}catch{throw new SecureIdError('Verification request is awaiting confirmation. Check status before trying again.');}
 if(!response.ok)throw new SecureIdError(response.status===401||response.status===403?'Identity verification account configuration needs attention. Contact dispatch.':'Verification is temporarily unavailable. Please check status before retrying.');
 try{return await response.json() as any;}catch{throw new SecureIdError('Verification response could not be confirmed.');}
}
export function verificationSummary(data:any,verificationId:string){
 if(data?.verification_id!==verificationId)throw new SecureIdError('Verification reference could not be confirmed.');
 const status=typeof data.form_status==='string'&&/^[A-Z_]{1,40}$/.test(data.form_status)?data.form_status:'UNKNOWN';
 const checks=Array.isArray(data.verification_details)?data.verification_details.map((v:any)=>({type:typeof v?.type==='string'?v.type.replace(/[^A-Z0-9_]/g,'').slice(0,70):'UNKNOWN',status:typeof v?.status==='string'?v.status.replace(/[^A-Z0-9_]/g,'').slice(0,40):'UNKNOWN'})):[];
 return {providerStatus:status,checksJson:JSON.stringify(checks)};
}
export function verifiedKyc(record:any){
 if(!record||record.flowVersion!==2||record.providerStatus!=='VERIFIED'||!['APPROVED','AUTO_APPROVED'].includes(record.reviewStatus))return false;
 try{const checks=JSON.parse(record.checksJson);return ['AADHAAR','PAN','BANK_ACCOUNT','IFSC','DRIVING_LICENSE','VEHICLE_RC'].every(type=>checks.some((c:any)=>c.type===type&&(c.status==='SUCCESS'||(c.status==='MANUAL_APPROVED'&&record.reviewStatus==='APPROVED'))));}catch{return false;}
}
