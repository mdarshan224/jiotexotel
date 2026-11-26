import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {db} from '@/lib/db';
import {reconcilePickupMilestones} from '@/lib/pickupMilestones';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie, Authorization'};
export async function GET(req:NextRequest){
 const user=await getAuthUser(req);
 if(!user||user.role!=='CUSTOMER'||!user.customerId)return NextResponse.json({success:false,message:'Customer authentication required.'},{status:401,headers});
 try{
  const result=await reconcilePickupMilestones(db,user.customerId);
  if(!result)return NextResponse.json({success:false,message:'Customer account unavailable.'},{status:404,headers});
  return NextResponse.json({success:true,data:result.progress},{headers});
 }catch{return NextResponse.json({success:false,message:'Milestone progress is temporarily unavailable. Please refresh.'},{status:503,headers});}
}
