import {describe,it,expect,vi,beforeEach} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({order:{} as any,createGateway:vi.fn(),warm:vi.fn(),dispatch:vi.fn(),update:vi.fn()}));
vi.mock('@/lib/db',()=>({db:{order:{updateMany:m.update}}}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:async()=>({role:'CUSTOMER',customerId:'audit-customer'})}));
vi.mock('@/lib/services/orderService',()=>({createOrder:async()=>m.order,OrderIdempotencyConflictError:class extends Error{},InvalidWasteCategoryError:class extends Error{},InvalidBookingWeightError:class extends Error{},InvalidIdempotencyKeyError:class extends Error{},ServiceAreaUnavailableError:class extends Error{}}));
vi.mock('@/lib/payments/verification',()=>({dispatchPaidOrderToAgents:m.dispatch}));
vi.mock('@/lib/payments/razorpay',()=>({createRazorpayOrder:m.createGateway,warmRazorpayConnection:m.warm,RazorpayOrderCreationError:class extends Error{}}));
vi.mock('@/lib/validations/serviceArea',()=>({validateServiceArea:()=>({serviceable:true}),SERVICE_AREA_UNAVAILABLE_CODE:'UNAVAILABLE',SERVICE_AREA_UNAVAILABLE_MESSAGE:'Unavailable'}));
import {POST} from '@/app/api/orders/route';
const request=()=>new NextRequest('http://localhost/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentMethod:'WALLET',address:{houseNo:'1',street:'Audit',area:'BTM Layout',lat:12.91,lng:77.61},items:[{categoryId:'audit-paper',estimatedWeight:1}]})});
beforeEach(()=>{vi.clearAllMocks();m.update.mockResolvedValue({count:1});m.order={id:'audit-order',orderNumber:'AUDIT',status:'BOOKING_RECEIVED',financialDirection:'CUSTOMER_PAYS',paymentStatus:'PENDING',finalAmount:49,payments:[]};});
describe('Booking payment source and covered dispatch',()=>{
 it('does not initialize or warm the gateway for wallet bookings',async()=>{const r=await POST(request());expect(r.status).toBe(201);expect(m.createGateway).not.toHaveBeenCalled();expect(m.warm).not.toHaveBeenCalled();expect(m.dispatch).not.toHaveBeenCalled();});
 it('captures and dispatches a covered pickup without an external payment callback',async()=>{m.order.finalAmount=0;m.order.paymentStatus='PAID';expect((await POST(request())).status).toBe(201);expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:{paymentStatus:'CAPTURED'}}));expect(m.dispatch).toHaveBeenCalledWith('audit-order');expect(m.createGateway).not.toHaveBeenCalled();});
 it('does not dispatch a cancelled covered pickup',async()=>{m.order.finalAmount=0;m.order.status='CANCELLED';await POST(request());expect(m.dispatch).not.toHaveBeenCalled();});
});
