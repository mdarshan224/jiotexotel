import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {requireSupportAdmin} from '@/lib/voice/supportCalls';
import {VoiceError} from '@/lib/voice/exotel';
import {db} from '@/lib/db';
export async function GET(req:NextRequest){
 try{
  requireSupportAdmin(await getAuthUser(req));
  const q=(req.nextUrl.searchParams.get('q')||'').trim().slice(0,80);
  const phoneQuery=q.replace(/[^0-9]/g,'').replace(/^91(?=\d{10}$)/,'');
  const rows=await db.customer.findMany({where:{user:{role:'CUSTOMER',deletionDueAt:null,...(q?{OR:[{name:{contains:q}},...(phoneQuery?[{phone:{contains:phoneQuery}}]:[])]}:{})}},select:{id:true,user:{select:{name:true,phone:true}}},orderBy:{createdAt:'desc'},take:20});
  return NextResponse.json({success:true,data:rows.map(row=>({id:row.id,name:row.user.name,phone:row.user.phone}))},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({success:false,message:e instanceof VoiceError?e.message:'Customer search is unavailable.'},{status:e instanceof VoiceError?e.status:503});}
}
