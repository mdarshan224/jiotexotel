import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {db} from '@/lib/db';
import {customerPickupOtp,PickupOtpError} from '@/lib/orders/pickupOtp';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const auth=await getAuthUser(req);if(auth?.role!=='CUSTOMER'||!auth.customerId)return NextResponse.json({success:false,message:'Customer sign-in is required.'},{status:401});
 const {id}=await params;return NextResponse.json({success:true,data:await customerPickupOtp(db,id,auth.customerId)},{headers:{'Cache-Control':'no-store, private','Pragma':'no-cache'}});
}catch(e){return NextResponse.json({success:false,message:e instanceof PickupOtpError?e.message:'Pickup verification is temporarily unavailable.'},{status:e instanceof PickupOtpError?e.status:503});}}
