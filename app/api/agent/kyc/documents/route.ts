import {NextRequest,NextResponse} from 'next/server';
import {env} from 'cloudflare:workers';
import {getAuthUser,isAdminRole} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {SecureIdError} from '@/lib/cashfree/secureId';
import {addRcDocument,publicFullKyc} from '@/lib/cashfree/fullAgentKyc';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function POST(req:NextRequest){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')throw new SecureIdError('Request not allowed.',403);
 const auth=await getAuthUser(req);if(auth?.role!=='AGENT'||!auth.agentId)throw new SecureIdError('Agent access required.',401);
 const data=await req.formData(),side=data.get('side'),file=data.get('file');if(!['front','back'].includes(String(side))||!(file instanceof File))throw new SecureIdError('Choose an RC side and photo.',400);
 if(file.size>5*1024*1024||file.size<12)throw new SecureIdError('Use an RC photo smaller than 5 MB.',400);
 const bytes=new Uint8Array(await file.arrayBuffer());const mime=file.type;
 const valid=mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||mime==='image/png'&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71||mime==='image/webp'&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!valid)throw new SecureIdError('Use a valid JPG, PNG or WebP RC photo.',400);
 const old=await db.agentKyc.findUnique({where:{agentId:auth.agentId}});const oldProfile=JSON.parse(old?.profileJson||'{}');const oldKey=oldProfile[side==='front'?'rcFrontKey':'rcBackKey'];
 const key=`agent-kyc/${auth.agentId}/rc-${side}-${crypto.randomUUID()}.${mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg'}`;
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
 try{const row=await addRcDocument(auth.agentId,side as 'front'|'back',key);if(typeof oldKey==='string'&&oldKey.startsWith(`agent-kyc/${auth.agentId}/`))await env.BUCKET.delete(oldKey).catch(()=>undefined);return NextResponse.json({success:true,data:publicFullKyc(row)},{headers});}catch(e){await env.BUCKET.delete(key);throw e;}
}catch(error){return NextResponse.json({success:false,message:error instanceof SecureIdError?error.message:'Could not upload RC photo.'},{status:error instanceof SecureIdError?error.status:503,headers});}}
export async function GET(req:NextRequest){try{
 const auth=await getAuthUser(req);if(!auth)throw new SecureIdError('Sign-in required.',401);
 const agentId=req.nextUrl.searchParams.get('agentId')||'',side=req.nextUrl.searchParams.get('side');if(!['front','back'].includes(side||''))throw new SecureIdError('Invalid document side.',400);
 if(!isAdminRole(auth)&&(auth.role!=='AGENT'||auth.agentId!==agentId))throw new SecureIdError('Document access denied.',403);
 const row=await db.agentKyc.findUnique({where:{agentId}}),profile=JSON.parse(row?.profileJson||'{}'),key=profile[side==='front'?'rcFrontKey':'rcBackKey'];
 if(typeof key!=='string'||!key.startsWith(`agent-kyc/${agentId}/`))throw new SecureIdError('RC document not found.',404);
 const object=await env.BUCKET.get(key);if(!object)throw new SecureIdError('RC document not found.',404);
 if(isAdminRole(auth))await db.auditLog.create({data:{userId:auth.userId,action:'AGENT_KYC_DOCUMENT_VIEWED',newValue:JSON.stringify({agentId,side})}});
 return new Response(await object.arrayBuffer(),{headers:{...headers,'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Content-Security-Policy':"default-src 'none'; sandbox"}});
}catch(error){return NextResponse.json({success:false,message:error instanceof SecureIdError?error.message:'Could not load RC document.'},{status:error instanceof SecureIdError?error.status:503,headers});}}
