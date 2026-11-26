import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {redactSupportSecrets,ticketId,consumeSupportAllowance} from '@/lib/ai/customerAssistant';
export async function POST(req:NextRequest){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({success:false},{status:403});const auth=await getAuthUser(req);if(auth?.role!=='CUSTOMER'||!auth.customerId)return NextResponse.json({success:false},{status:401});
 const raw=await req.text();if(raw.length>8000)return NextResponse.json({success:false},{status:413});const b=JSON.parse(raw);if(typeof b.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(b.requestId)||typeof b.description!=='string'||b.description.trim().length<8||b.description.length>2000)return NextResponse.json({success:false,message:'Describe your issue in 8–2,000 characters.'},{status:400});
 const id=ticketId(auth.customerId,b.requestId);const previous=await db.complaint.findUnique({where:{id}});if(previous)return NextResponse.json({success:true,referenceId:id});
 if(!await consumeSupportAllowance(db,auth.userId,'SUPPORT_TICKET_REQUEST'))return NextResponse.json({success:false,message:'Please wait before submitting another issue.'},{status:429});
 const order=b.orderId?await db.order.findFirst({where:{id:b.orderId,customerId:auth.customerId}}):null;if(b.orderId&&!order)return NextResponse.json({success:false,message:'Pickup not found.'},{status:404});
 await db.$transaction(async tx=>{await tx.complaint.create({data:{id,customerId:auth.customerId!,orderId:order?.id||null,category:'SUPPORT',description:redactSupportSecrets(b.description.trim())}});const admins=await tx.user.findMany({where:{role:{in:['ADMIN','SUPER_ADMIN']},deletionDueAt:null},select:{id:true}});for(const admin of admins)await tx.notification.create({data:{userId:admin.id,orderId:order?.id||null,type:'SUPPORT_ESCALATION',recipient:admin.id,provider:'IN_APP',content:`Customer support issue ${id}${order?' · '+order.orderNumber:''}. Review the support queue.`,status:'SENT'}});});
 return NextResponse.json({success:true,referenceId:id},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({success:false,message:'Could not submit your issue. Please retry.'},{status:503});}}
