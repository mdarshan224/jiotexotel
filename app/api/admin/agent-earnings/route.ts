import {NextRequest,NextResponse} from 'next/server';
import {getAuthUser,isAdminRole} from '@/lib/auth/middleware';
import {db} from '@/lib/db';
export async function GET(req:NextRequest){
 if(!isAdminRole(await getAuthUser(req)))return NextResponse.json({success:false,message:'Admin access required.'},{status:403});
 try{const rows=await db.pickupEarning.findMany({include:{order:{select:{orderNumber:true}},agent:{select:{user:{select:{name:true}}}}},orderBy:{createdAt:'desc'},take:100});
 return NextResponse.json({success:true,data:rows.map(r=>({id:r.id,orderNumber:r.order.orderNumber,agentName:r.agent.user.name,grossPaise:r.grossPaise,agentPaise:r.agentPaise,companyGrossPaise:r.companyGrossPaise,serviceFeePaise:r.serviceFeePaise,gstPaise:r.gstPaise,gstRate:r.gstRate,cgstPaise:r.cgstPaise,sgstPaise:r.sgstPaise,igstPaise:r.igstPaise,createdAt:r.createdAt,policy:r.policy}))},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({success:false,message:'Unable to load pickup earnings.'},{status:503});}
}
