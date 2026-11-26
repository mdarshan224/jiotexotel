import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {db} from '@/lib/db';
import {getTrackingRoute} from '@/lib/orders/googleTracking';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await getAuthUser(req);if(auth?.role!=='CUSTOMER'||!auth.customerId)return NextResponse.json({success:false},{status:401});
 try{const data=await getTrackingRoute(db,(await params).id,auth.customerId);return NextResponse.json({success:data.status!=='NOT_FOUND',data},{status:data.status==='NOT_FOUND'?404:200,headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({success:false,message:'Tracking is temporarily unavailable.'},{status:503});}
}
