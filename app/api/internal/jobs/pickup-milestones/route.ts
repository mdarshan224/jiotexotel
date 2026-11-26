import {createHmac,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {reconcileHistoricalPickupMilestones} from '@/lib/pickupMilestones';
import {COMPLETED_PICKUP_STATUSES} from '@/lib/pickupMilestonesPolicy';
import {getJwtSecret} from '@/lib/auth/jwtSecret';
function authorized(req:NextRequest){
 try{const expected=createHmac('sha256',getJwtSecret()).update('junkitout:pickup-milestones:v1').digest('hex');const supplied=(req.headers.get('authorization')||'').replace(/^Bearer /,'');return supplied.length===expected.length&&timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));}catch{return false;}
}
export async function GET(req:NextRequest){
 if(!authorized(req))return NextResponse.json({success:false},{status:401});
 const eligible=await db.customer.count({where:{user:{role:'CUSTOMER',deletionDueAt:null},orders:{some:{status:{in:COMPLETED_PICKUP_STATUSES}}}}});
 return NextResponse.json({success:true,readOnly:true,data:{eligibleCustomers:eligible}},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 if(!authorized(req))return NextResponse.json({success:false},{status:401});
 try{const body=await req.json().catch(()=>({}));const cursor=typeof body.cursor==='string'&&body.cursor.length<200?body.cursor:undefined;const limit=Number.isInteger(body.limit)?body.limit:10;
  return NextResponse.json({success:true,data:await reconcileHistoricalPickupMilestones(db,{cursor,limit})},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({success:false,message:'Milestone reconciliation failed. Retrying is safe.'},{status:503});}
}
