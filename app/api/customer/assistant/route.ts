import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {ownSupportOrders,consumeSupportAllowance,answerCustomerQuestion} from '@/lib/ai/customerAssistant';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest){const auth=await getAuthUser(req);if(auth?.role!=='CUSTOMER'||!auth.customerId)return NextResponse.json({success:false,message:'Sign in to get help with your pickups.'},{status:401,headers});return NextResponse.json({success:true,orders:await ownSupportOrders(db,auth.customerId)},{headers});}
export async function POST(req:NextRequest){
 try{if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({success:false},{status:403});const auth=await getAuthUser(req);if(auth?.role!=='CUSTOMER'||!auth.customerId)return NextResponse.json({success:false,message:'Sign in to get help with your pickups.'},{status:401,headers});
 const raw=await req.text();if(raw.length>16000)return NextResponse.json({success:false,message:'Message is too long.'},{status:413});const body=JSON.parse(raw);const message=typeof body.message==='string'?body.message.trim():'';if(!message||message.length>2000)return NextResponse.json({success:false,message:'Enter a question under 2,000 characters.'},{status:400});
 if(!await consumeSupportAllowance(db,auth.userId))return NextResponse.json({success:false,message:'Please wait before sending more messages.'},{status:429,headers:{...headers,'Retry-After':'60'}});
 const orders=await ownSupportOrders(db,auth.customerId);const order=body.orderId?orders.find(o=>o.id===body.orderId):orders[0];if(body.orderId&&!order)return NextResponse.json({success:false,message:'Pickup not found in your recent orders.'},{status:404});
 const result=await answerCustomerQuestion(message,Array.isArray(body.history)?body.history:[],order);
 return NextResponse.json({success:true,...result,order,suggestedQuestions:['Where is my pickup agent?','What is my payment or refund status?','How do I start my pickup?'],authenticated:true},{headers});
 }catch{return NextResponse.json({success:false,message:'Support is temporarily unavailable. Please use Help & support to raise a ticket.'},{status:503,headers});}
}
