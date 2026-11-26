import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {voiceConfig,exotelRequest,parseExotelBalance} from '@/lib/voice/exotel';
export async function GET(req:NextRequest){
 const auth=await getAuthUser(req);
 if(!auth || !['ADMIN','SUPER_ADMIN'].includes(auth.role))return NextResponse.json({success:false},{status:403});
 const c=voiceConfig();
 const data:any={enabled:c.enabled,ready:c.ready,host:c.host,virtualNumber:c.callerId,mode:'LEGACY_DIRECT',dynamicRoutingEnabled:false,configured:{EXOTEL_ACCOUNT_SID:Boolean(c.sid),EXOTEL_API_KEY:Boolean(c.key),EXOTEL_API_TOKEN:Boolean(c.token),EXOTEL_CALLER_ID:Boolean(c.callerId),EXOTEL_HOST:['api.exotel.com','api.in.exotel.com'].includes(c.host)}};
 if(req.nextUrl.searchParams.get('check')==='true' && c.ready){
  try {const result=await exotelRequest('Balance.json'); data.balance=parseExotelBalance(result);data.connection='verified';}catch{data.connection='failed';}
 }
 return NextResponse.json({success:true,data},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(req:NextRequest){const auth=await getAuthUser(req);if(!auth||!['ADMIN','SUPER_ADMIN'].includes(auth.role))return NextResponse.json({success:false},{status:403});return NextResponse.json({success:false,message:'Custom call routing is paused. The previous direct calling flow is active.'},{status:410,headers:{'Cache-Control':'no-store'}});}
