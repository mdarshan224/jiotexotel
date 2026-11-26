import {createHmac} from 'node:crypto';
import {db} from '@/lib/db';
import {getJwtSecret} from '@/lib/auth/jwtSecret';
import {SecureIdError,secureIdRequest,secureIdConfig,verifiedKyc} from './secureId';
export const KYC_CHECKS=['AADHAAR','PAN','BANK_ACCOUNT','IFSC','DRIVING_LICENSE','VEHICLE_RC'] as const;
const json=(value:string|undefined,fallback:any)=>{try{return JSON.parse(value||'');}catch{return fallback;}};
const text=(value:unknown,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
const cleanName=(value:unknown)=>text(value).normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
export function isoDob(value:unknown){const str=text(value,30),match=/^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(str);const iso=match?`${match[3]}-${match[2]}-${match[1]}`:str;if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)throw new SecureIdError('Enter a valid date of birth.',400);return iso;}
export function kycReadiness(evidence:any,profile:any){
 const checks=KYC_CHECKS.map(type=>({type,status:evidence[type]?.status||'NOT_STARTED'}));
 const issues=KYC_CHECKS.flatMap(type=>evidence[type]?.issues||[]);
 const rc=evidence.VEHICLE_RC;
 const documentsRequired=!!rc&&(!!rc.ownerMismatch||!!rc.verifiedName&&[evidence.AADHAAR?.verifiedName,evidence.PAN?.verifiedName].filter(Boolean).some(name=>cleanName(name)!==cleanName(rc.verifiedName)));
 if(documentsRequired&&!issues.includes('Vehicle ownership requires manual approval.'))issues.push('Vehicle ownership requires manual approval.');
 const dl=evidence.DRIVING_LICENSE,vehicle=evidence.VEHICLE_RC;
 if(dl&&vehicle&&['SUCCESS','MISMATCH'].includes(dl.status)&&['SUCCESS','MISMATCH'].includes(vehicle.status)){const classes=String(dl.details?.vehicleClasses||'').toUpperCase(),rcClass=String(vehicle.details?.vehicleClass||'').toUpperCase();const transportValid=dl.details?.transportExpiry&&!expired(dl.details.transportExpiry);const matched=profile.vehicleType==='Light goods vehicle'&&/LIGHT|LMV|GOODS/.test(rcClass)&&/LMV/.test(classes)&&transportValid||profile.vehicleType==='Truck'&&/HEAVY|HGV|HMV/.test(rcClass)&&/HGV|HMV/.test(classes)&&transportValid||profile.vehicleType==='Three-wheeler goods vehicle'&&/THREE|3W|3 W/.test(rcClass)&&/3W|3 W|THREE/.test(classes)&&transportValid||profile.vehicleType==='Two-wheeler'&&/MOTOR|SCOOTER|M.?CYCLE/.test(rcClass)&&/MCWG|MCWOG|MOTOR|SCOOTER/.test(classes);if(!matched)issues.push('Driving licence and vehicle class require operations review.');}
 const documentsReady=!documentsRequired||!!(profile.rcFrontKey&&profile.rcBackKey);
 const complete=checks.every(c=>['SUCCESS','MISMATCH'].includes(c.status));
 return{checks,issues,documentsRequired,documentsReady,complete,automatic:complete&&documentsReady&&issues.length===0&&checks.every(c=>c.status==='SUCCESS')};
}
export function publicFullKyc(row:any,admin=false){
 if(!row)return null;const evidence=json(row.evidenceJson,{}),profile=json(row.profileJson,{}),state=kycReadiness(evidence,profile);
 return{id:row.id,flowVersion:row.flowVersion,providerStatus:row.providerStatus,reviewStatus:row.reviewStatus,approved:verifiedKyc(row),consentAt:row.consentAt,reviewedAt:row.reviewedAt,reviewReason:row.reviewReason,expiresAt:row.expiresAt,
  aadhaarLink:row.flowVersion===2&&new Date(row.expiresAt)>new Date()&&safeDigiLockerUrl(row.formLink)?row.formLink:null,
  fullName:profile.fullName||'',dob:profile.dob||'',vehicleNumber:profile.vehicleNumber||'',vehicleType:profile.vehicleType||'',
  checks:KYC_CHECKS.map(type=>({type,...(evidence[type]?{status:evidence[type].status,verifiedName:evidence[type].verifiedName,maskedId:evidence[type].maskedId,issues:evidence[type].issues||[],referenceId:admin?evidence[type].referenceId:undefined,details:evidence[type].details||{}}:{status:'NOT_STARTED'})})),
  issues:state.issues,documentsRequired:state.documentsRequired,documentsReady:state.documentsReady,canReview:state.complete&&state.documentsReady,
  rcFront:profile.rcFrontKey?`/api/agent/kyc/documents?agentId=${encodeURIComponent(row.agentId)}&side=front`:null,rcBack:profile.rcBackKey?`/api/agent/kyc/documents?agentId=${encodeURIComponent(row.agentId)}&side=back`:null};
}
function safeDigiLockerUrl(value:unknown){try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['verification.cashfree.com','verification-test.cashfree.com'].includes(u.hostname);}catch{return false;}}
async function saveEvidence(row:any,evidence:any,profile=json(row.profileJson,{})){
 const state=kycReadiness(evidence,profile);
 const reviewStatus=state.automatic?'AUTO_APPROVED':state.issues.length>0||state.checks.some(c=>['MISMATCH','INVALID'].includes(c.status))?'PENDING_ADMIN_REVIEW':'PENDING';
 const providerStatus=state.automatic?'VERIFIED':reviewStatus==='PENDING_ADMIN_REVIEW'?'MANUAL_REVIEW':'IN_PROGRESS';
 const changed=await db.agentKyc.updateMany({where:{id:row.id,revision:row.revision},data:{evidenceJson:JSON.stringify(evidence),profileJson:JSON.stringify(profile),issuesJson:JSON.stringify(state.issues),checksJson:JSON.stringify(state.checks),providerStatus,reviewStatus,revision:{increment:1},reviewedBy:null,reviewedAt:state.automatic?new Date():null,reviewReason:null}});
 if(changed.count!==1)throw new SecureIdError('Verification changed. Refresh to view the latest results.',409);
 if(state.automatic)await db.agent.update({where:{id:row.agentId},data:{kycRequired:true,...(profile.vehicleNumber?{vehicleNumber:profile.vehicleNumber}:{}),...(profile.vehicleType?{vehicleType:profile.vehicleType}:{})}});
 return db.agentKyc.findUniqueOrThrow({where:{id:row.id}});
}
export async function startFullKyc(agentId:string,body:any,origin:string){
 if(body.consent!==true)throw new SecureIdError('Consent is required before verification.',400);
 const fullName=text(body.fullName),dob=isoDob(body.dob);if(fullName.length<3)throw new SecureIdError('Enter your full legal name.',400);
 const agent=await db.agent.findUniqueOrThrow({where:{id:agentId}});
 let row=await db.agentKyc.findUnique({where:{agentId}});
 if(row&&(verifiedKyc(row)||row.flowVersion===2&&['SUCCESS','MISMATCH'].includes(json(row.evidenceJson,{}).AADHAAR?.status)))return row;
 if(row?.flowVersion===2&&row.expiresAt>new Date()){if(row.formLink)return row;if(['CREATING','UNKNOWN'].includes(row.providerStatus))throw new SecureIdError('Identity link is awaiting confirmation. Check verification status before starting again.',409);}
 const verificationId='JIO'+crypto.randomUUID().replaceAll('-','');
 const data={flowVersion:2,verificationId,templateName:'JIO_FULL_KYC_V2',consentAt:new Date(),expiresAt:new Date(Date.now()+600000),providerStatus:'CREATING',reviewStatus:'PENDING',formLink:null,evidenceJson:row?.flowVersion===2?row.evidenceJson:'{}',profileJson:JSON.stringify({...json(row?.profileJson,{}),fullName,dob}),checksJson:'[]',issuesJson:'[]',reviewedBy:null,reviewedAt:null,reviewReason:null,revision:{increment:1}};
 if(row){const changed=await db.agentKyc.updateMany({where:{id:row.id,revision:row.revision},data});if(!changed.count)throw new SecureIdError('Identity verification is already starting. Refresh its status.',409);row=await db.agentKyc.findUniqueOrThrow({where:{id:row.id}});}else{const {revision,...create}=data;row=await db.agentKyc.create({data:{agentId,...create}});}
 await db.agent.update({where:{id:agentId},data:{kycRequired:true,status:'OFFLINE'}});
 await db.auditLog.create({data:{userId:agent.userId,action:'AGENT_FULL_KYC_CONSENT',newValue:'JIO_FULL_KYC_V2'}});
 try{const result=await secureIdRequest('digilocker',{verification_id:verificationId,document_requested:['AADHAAR'],redirect_url:origin+'/agent/onboarding',user_flow:body.userFlow==='signin'?'signin':'signup',purpose:'Agent onboarding',company_name:'Junk It Out'});
  if(result.verification_id!==verificationId||!safeDigiLockerUrl(result.url))throw new SecureIdError('Identity link could not be confirmed. Check status before retrying.');
  return db.agentKyc.update({where:{id:row.id},data:{providerStatus:'IN_PROGRESS',formLink:result.url}});
 }catch(error){await db.agentKyc.update({where:{id:row.id},data:{providerStatus:'UNKNOWN'}});throw error;}
}
export async function refreshFullKyc(agentId:string){
 const row=await db.agentKyc.findUnique({where:{agentId}});if(!row||row.flowVersion!==2||verifiedKyc(row))return row;
 const evidence=json(row.evidenceJson,{});if(['SUCCESS','MISMATCH'].includes(evidence.AADHAAR?.status))return row;
 const status=await secureIdRequest('digilocker?verification_id='+row.verificationId);
 if(status.verification_id!==row.verificationId)throw new SecureIdError('Verification reference mismatch.');
 if(status.status!=='AUTHENTICATED')return row;
 const document=await secureIdRequest('digilocker/document/AADHAAR?verification_id='+row.verificationId);
 if(document.verification_id!==row.verificationId||document.status!=='SUCCESS'||!text(document.name)||String(document.uid||'').replace(/\D/g,'').length<4)throw new SecureIdError('Aadhaar document could not be verified.');
 const profile=json(row.profileJson,{}),name=text(document.name),dob=isoDob(document.dob),issues:string[]=[];
 if(cleanName(name)!==cleanName(profile.fullName))issues.push('Aadhaar name differs from the submitted legal name.');
 if(dob!==profile.dob)issues.push('Aadhaar date of birth differs from the submitted date.');
 evidence.AADHAAR={status:issues.length?'MISMATCH':'SUCCESS',verifiedName:name,maskedId:'XXXXXXXX'+String(document.uid||'').replace(/\D/g,'').slice(-4),referenceId:String(document.reference_id||row.verificationId),issues,details:{dob}};
 return saveEvidence(row,evidence,profile);
}
async function compareName(first:string,second:string,reference:string){
 if(cleanName(first)&&cleanName(first)===cleanName(second))return{match:true,score:1};
 if(!first||!second)return{match:false,score:0};
 const result=await secureIdRequest('name-match',{verification_id:reference,name_1:first,name_2:second});
 return{match:result.verification_id===reference&&result.status==='SUCCESS'&&Number(result.score)>=1,score:Number(result.score)||0};
}
const expired=(value:any)=>{if(!value)return true;try{return new Date(isoDob(value)+'T23:59:59+05:30').getTime()<Date.now();}catch{return true;}};
export async function verifyFullKycStep(agentId:string,body:any){
 const type=text(body.type,30);if(!['PAN','BANK_ACCOUNT','IFSC','DRIVING_LICENSE','VEHICLE_RC'].includes(type))throw new SecureIdError('Choose a verification step.',400);
 let row=await db.agentKyc.findUnique({where:{agentId}});if(!row||row.flowVersion!==2)throw new SecureIdError('Complete Aadhaar verification first.',409);
 if(verifiedKyc(row))throw new SecureIdError('Your approved details are locked. Contact operations to change them.',409);
 const evidence=json(row.evidenceJson,{}),profile=json(row.profileJson,{}),aadhaar=evidence.AADHAAR;
 if(!aadhaar||!['SUCCESS','MISMATCH'].includes(aadhaar.status))throw new SecureIdError('Complete Aadhaar verification first.',409);
 let input:any;
 if(type==='PAN'){const pan=text(body.pan,12).toUpperCase();if(!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan))throw new SecureIdError('Enter a valid PAN.',400);input={pan,name:aadhaar.verifiedName};}
 if(type==='BANK_ACCOUNT'){const account=text(body.bankAccount,30),ifsc=text(body.ifsc,11).toUpperCase();if(!/^\d{9,18}$/.test(account)||! /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))throw new SecureIdError('Enter a valid bank account and IFSC.',400);if(evidence.IFSC?.status!=='SUCCESS'||evidence.IFSC?.details?.ifsc!==ifsc)throw new SecureIdError('Verify this IFSC before the bank account.',409);input={bank_account:account,ifsc,name:aadhaar.verifiedName};}
 if(type==='IFSC'){const ifsc=text(body.ifsc,11).toUpperCase();if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))throw new SecureIdError('Enter a valid IFSC.',400);input={ifsc};}
 if(type==='DRIVING_LICENSE'){const dl=text(body.drivingLicence,25).toUpperCase().replace(/[ -]/g,'');if(!/^[A-Z0-9]{8,20}$/.test(dl))throw new SecureIdError('Enter a valid driving licence.',400);input={dl_number:dl,dob:aadhaar.details.dob};}
 if(type==='VEHICLE_RC'){const number=text(body.vehicleNumber,20).toUpperCase().replace(/[ -]/g,'');if(!/^[A-Z0-9]{6,15}$/.test(number))throw new SecureIdError('Enter a valid vehicle registration number.',400);if(!text(body.vehicleType,80))throw new SecureIdError('Select your vehicle type.',400);input={vehicle_number:number};}
 const fingerprint=createHmac('sha256',getJwtSecret()).update(agentId+type+JSON.stringify(input)).digest('hex');
 const prior=evidence[type];if(prior?.fingerprint===fingerprint&&['SUCCESS','MISMATCH','INVALID'].includes(prior.status))return row;
 if(prior?.status==='PROCESSING'||prior?.status==='UNKNOWN')throw new SecureIdError('This verification is awaiting confirmation. Contact operations before retrying.',409);
 const reference='JIO'+crypto.randomUUID().replaceAll('-','');
 evidence[type]={status:'PROCESSING',fingerprint,referenceId:reference,issues:[]};
 row=await saveEvidence(row,evidence,profile);
 try{
  const paths:any={PAN:'pan',BANK_ACCOUNT:'bank-account/sync',IFSC:'ifsc',DRIVING_LICENSE:'driving-license',VEHICLE_RC:'vehicle-rc'};
  const result=await secureIdRequest(paths[type],{...input,...(['IFSC','DRIVING_LICENSE','VEHICLE_RC'].includes(type)?{verification_id:reference}:{})});
  if(result.verification_id&&result.verification_id!==reference)throw new SecureIdError('Verification reference mismatch.');
  let valid=false,name='',maskedId='',details:any={},ownerMismatch=false;const issues:string[]=[];
  if(type==='PAN'){valid=result.valid===true&&(!result.pan_status||result.pan_status==='VALID');name=text(result.registered_name||result.name_pan_card);maskedId=input.pan.slice(0,2)+'******'+input.pan.slice(-2);details={panStatus:text(result.pan_status,50)};}
  if(type==='IFSC'){valid=result.status==='VALID'&&result.ifsc===input.ifsc;details={ifsc:input.ifsc,bank:text(result.bank),branch:text(result.branch)};maskedId=input.ifsc;}
  if(type==='BANK_ACCOUNT'){valid=result.account_status==='VALID';name=text(result.name_at_bank);maskedId='••••'+input.bank_account.slice(-4);details={ifsc:input.ifsc,bank:text(result.bank_name),branch:text(result.branch)};}
  if(type==='DRIVING_LICENSE'){valid=result.status==='VALID';name=text(result.details_of_driving_licence?.name);maskedId='••••'+input.dl_number.slice(-4);const validity=result.dl_validity?.transport?.to?result.dl_validity.transport:result.dl_validity?.non_transport;const expiry=validity?.to||validity?.valid_to||validity?.valid_upto;const cov=result.details_of_driving_licence?.cov_details||result.details_of_driving_licence?.split_address?.cov_details||[];const vehicleClasses=[...cov,...(result.badge_details||[])].flatMap((v:any)=>[v.class_of_vehicle||v.cov||v.class||'']).flat().filter((v:any)=>typeof v==='string').map((v:string)=>text(v,80)).join(', ');details={expiry:text(expiry,30),licenceStatus:text(result.status,50),vehicleClasses,transportExpiry:text(result.dl_validity?.transport?.to,30)};if(expired(expiry))issues.push('Driving licence validity needs manual review.');if(result.dob&&isoDob(result.dob)!==aadhaar.details.dob)issues.push('Driving licence date of birth does not match Aadhaar.');}
  if(type==='VEHICLE_RC'){valid=result.status==='VALID'&&text(result.reg_no||result.vehicle_number).replace(/[ -]/g,'')===input.vehicle_number;name=text(result.owner);maskedId=input.vehicle_number;details={registrationNumber:input.vehicle_number,model:text(result.model),manufacturer:text(result.vehicle_manufacturer_name),vehicleClass:text(result.class),rcStatus:text(result.rc_status),expiry:text(result.rc_expiry_date,30),insuranceExpiry:text(result.vehicle_insurance_upto,30)};profile.vehicleNumber=input.vehicle_number;profile.vehicleType=text(body.vehicleType,80);if(result.rc_status!=='ACTIVE')issues.push('Vehicle RC status needs manual review.');if(expired(result.rc_expiry_date))issues.push('Vehicle RC validity needs manual review.');if(expired(result.vehicle_insurance_upto))issues.push('Vehicle insurance validity needs manual review.');}
  if(!valid)issues.push(`${type.replaceAll('_',' ')} was not verified as valid by Cashfree.`);
  if(type!=='IFSC'&&valid){const match=await compareName(aadhaar.verifiedName,name,reference+'N');details.nameMatchScore=match.score;if(!match.match){issues.push(`${type.replaceAll('_',' ')} name does not match Aadhaar exactly.`);if(type==='VEHICLE_RC')ownerMismatch=true;}}
  if(type==='VEHICLE_RC'&&evidence.PAN?.verifiedName&&valid){const match=await compareName(evidence.PAN.verifiedName,name,reference+'P');if(!match.match){ownerMismatch=true;issues.push('Vehicle RC owner name does not match PAN.');}}
  evidence[type]={status:!valid?'INVALID':issues.length?'MISMATCH':'SUCCESS',verifiedName:name,maskedId,referenceId:String(result.reference_id||reference),fingerprint,issues,details,...(type==='VEHICLE_RC'?{ownerMismatch}:{})};
  // Changing IFSC invalidates a bank check for another branch; it cannot retain approval.
  if(type==='IFSC'&&evidence.BANK_ACCOUNT?.details?.ifsc!==input.ifsc)delete evidence.BANK_ACCOUNT;
  return saveEvidence(row,evidence,profile);
 }catch(error){evidence[type]={status:'UNKNOWN',fingerprint,referenceId:reference,issues:['Verification could not be confirmed. Operations must review before another request.']};await saveEvidence(row,evidence,profile);throw error;}
}
export async function addRcDocument(agentId:string,side:'front'|'back',key:string){
 const row=await db.agentKyc.findUniqueOrThrow({where:{agentId}});if(verifiedKyc(row))throw new SecureIdError('Approved documents are locked.',409);
 const profile=json(row.profileJson,{});profile[side==='front'?'rcFrontKey':'rcBackKey']=key;
 return saveEvidence(row,json(row.evidenceJson,{}),profile);
}
export async function reviewFullKyc(agentId:string,reviewerId:string,action:string,body:any){
 return db.$transaction(async tx=>{
  const row=await tx.agentKyc.findUniqueOrThrow({where:{agentId}});if(row.flowVersion!==2)throw new SecureIdError('Full agent verification is required.',409);
  if(action==='refresh')return row;
  const evidence=json(row.evidenceJson,{}),profile=json(row.profileJson,{}),state=kycReadiness(evidence,profile),reason=text(body.reason,1000);
  if(!['approve','reject','reset'].includes(action))throw new SecureIdError('Select a review action.',400);
  if(reason.length<10)throw new SecureIdError('Add a review note of at least 10 characters.',400);
  if(action==='approve'&&(!state.complete||!state.documentsReady||body.acknowledged!==true))throw new SecureIdError('Review all verified documents, resolve missing checks and attach both RC sides when ownership differs.',409);
  if(action==='reset'){
   const type=text(body.type,30);if(!KYC_CHECKS.includes(type as any)||!['UNKNOWN','INVALID','PROCESSING','MISMATCH'].includes(evidence[type]?.status))throw new SecureIdError('Only an unresolved check can be reset after provider review.',409);delete evidence[type];
   const changed=await tx.agentKyc.updateMany({where:{id:row.id,revision:row.revision},data:{evidenceJson:JSON.stringify(evidence),reviewStatus:'PENDING',providerStatus:'IN_PROGRESS',reviewReason:reason,revision:{increment:1}}});if(!changed.count)throw new SecureIdError('Verification changed. Refresh first.',409);
  }else{
   const checks=state.checks.map(check=>({...check,status:action==='approve'&&check.status==='MISMATCH'?'MANUAL_APPROVED':check.status}));
   const changed=await tx.agentKyc.updateMany({where:{id:row.id,revision:row.revision},data:{reviewStatus:action==='approve'?'APPROVED':'REJECTED',providerStatus:action==='approve'?'VERIFIED':'MANUAL_REVIEW',checksJson:JSON.stringify(checks),reviewedBy:reviewerId,reviewedAt:new Date(),reviewReason:reason,revision:{increment:1}}});if(!changed.count)throw new SecureIdError('Verification changed. Refresh first.',409);
   await tx.agent.update({where:{id:agentId},data:{status:'OFFLINE',kycRequired:true,...(action==='approve'?{vehicleNumber:profile.vehicleNumber,vehicleType:profile.vehicleType}:{})}});
  }
  await tx.auditLog.create({data:{userId:reviewerId,action:'AGENT_FULL_KYC_'+action.toUpperCase(),newValue:JSON.stringify({agentId,reason})}});
  return tx.agentKyc.findUniqueOrThrow({where:{id:row.id}});
 });
}
