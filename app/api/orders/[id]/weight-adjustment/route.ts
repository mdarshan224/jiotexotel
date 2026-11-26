import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser,isAdminRole} from '@/lib/auth/middleware';
import {hasTrustedOrigin} from '@/lib/auth/requestSecurity';
import {db} from '@/lib/db';
import {prepareWeightAdjustment,publicWeightAdjustment,WeightAdjustmentError,createWeightQr,checkWeightPayment,weightCheckout,payWeightWithWallet,applyWeightPayment} from '@/lib/orders/weightAdjustment';
import {fetchRazorpayPayment,verifyRazorpayPaymentSignature} from '@/lib/payments/razorpay';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
async function access(req:NextRequest,id:string){const auth=await getAuthUser(req);if(!auth)throw new WeightAdjustmentError('Sign-in required.',401);const order=await db.order.findUnique({where:{id},select:{id:true,agentId:true,customerId:true}});if(!order)throw new WeightAdjustmentError('Pickup not found.',404);if(!isAdminRole(auth)&&!(auth.role==='AGENT'&&auth.agentId===order.agentId)&&!(auth.role==='CUSTOMER'&&auth.customerId===order.customerId))throw new WeightAdjustmentError('This pickup is not accessible.',403);return{auth,order};}
function fail(error:unknown){return NextResponse.json({success:false,message:error instanceof WeightAdjustmentError?error.message:'The payment request could not be confirmed. Check its status before retrying.'},{status:error instanceof WeightAdjustmentError?error.status:503,headers});}
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const{id}=await params;await access(req,id);const row=await db.orderWeightAdjustment.findUnique({where:{orderId:id}});return NextResponse.json({success:true,data:publicWeightAdjustment(row)},{headers});}catch(e){return fail(e);}}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 if(!hasTrustedOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')throw new WeightAdjustmentError('Request not allowed.',403);
 const{id}=await params,{auth}=await access(req,id),body=await req.json();let row:any;
 if(body.action==='quote'){if(auth.role!=='AGENT'||!auth.agentId)throw new WeightAdjustmentError('Assigned agent access required.',403);row=await prepareWeightAdjustment(id,auth.agentId,body.actualWeights);}
 else if(body.action==='qr'){if(auth.role!=='AGENT')throw new WeightAdjustmentError('Agent access required.',403);row=await createWeightQr(id);}
 else if(body.action==='check')row=await checkWeightPayment(id);
 else if(body.action==='checkout'){if(auth.role!=='CUSTOMER')throw new WeightAdjustmentError('Customer access required.',403);return NextResponse.json({success:true,data:await weightCheckout(id)},{headers});}
 else if(body.action==='wallet'){if(auth.role!=='CUSTOMER'||!auth.customerId)throw new WeightAdjustmentError('Customer access required.',403);row=await payWeightWithWallet(id,auth.customerId);}
 else if(body.action==='verify'){
  if(auth.role!=='CUSTOMER')throw new WeightAdjustmentError('Customer access required.',403);const local=await db.orderWeightAdjustment.findUniqueOrThrow({where:{orderId:id}});
  if(!local.gatewayOrderId||body.razorpay_order_id!==local.gatewayOrderId||!verifyRazorpayPaymentSignature(local.gatewayOrderId,body.razorpay_payment_id,body.razorpay_signature))throw new WeightAdjustmentError('Payment signature could not be verified.',400);
  row=await applyWeightPayment(local.id,await fetchRazorpayPayment(body.razorpay_payment_id));
 }else throw new WeightAdjustmentError('Choose a valid payment action.',400);
 return NextResponse.json({success:true,data:publicWeightAdjustment(row)},{headers});
}catch(e){return fail(e);}}
