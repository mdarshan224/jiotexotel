import {createHmac,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {processUnassignedRefunds} from '@/lib/payments/automaticRefunds';
import {db} from '@/lib/db';
function authorized(req:NextRequest){
 const actual=Buffer.from(req.headers.get('authorization')||'');
 const tokens=[process.env.UNASSIGNED_REFUND_JOB_SECRET?.trim()];
 const jwt=process.env.JWT_SECRET?.trim();if(jwt)tokens.push(createHmac('sha256',jwt).update('junkitout:site-maintenance:v1').digest('hex'));
 return tokens.some(token=>{if(!token||token.length<32)return false;const expected=Buffer.from('Bearer '+token);return actual.length===expected.length&&timingSafeEqual(actual,expected);});
}
/** Authenticated read-only readiness endpoint. Never submits, reconciles, or changes a refund. */
export async function GET(req:NextRequest){if(!authorized(req))return NextResponse.json({success:false},{status:401});try{const due=await db.order.count({where:{timeoutPolicyVersion:1,agentId:null,status:{in:['BOOKING_RECEIVED','AGENT_BEING_ASSIGNED']},assignmentDeadlineAt:{lte:new Date()}}});const queued=await db.refundAttempt.count({where:{events:{some:{eventType:'AUTOMATIC_REFUND_QUEUED'}},status:{in:['QUEUED','REFUND_PROCESSING','REFUND_PENDING','REFUND_PENDING_RECONCILIATION']}}});return NextResponse.json({success:true,readOnly:true,data:{due,queued}},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({success:false,readOnly:true},{status:503});}}
export async function POST(req:NextRequest){
 if(!authorized(req))return NextResponse.json({success:false},{status:401});
 try{const data=await processUnassignedRefunds();return NextResponse.json({success:data.failed===0&&data.reviewRequired===0,data},{status:data.failed||data.reviewRequired?503:200,headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({success:false,message:'Refund job requires retry or admin review.'},{status:503});}
}
