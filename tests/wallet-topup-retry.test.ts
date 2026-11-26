import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),find:vi.fn(),key:vi.fn(),quote:vi.fn()}));
vi.mock('@/lib/auth/middleware',()=>({getAuthUser:m.auth}));
vi.mock('@/lib/db',()=>({db:{walletTransaction:{findUnique:m.find}}}));
vi.mock('@/lib/payments/razorpay',()=>({getResolvedRazorpayKeyId:m.key,createRazorpayOrder:vi.fn(),RazorpayOrderCreationError:class extends Error{}}));
vi.mock('@/lib/walletBonus',()=>({calculateWalletBonusQuote:m.quote}));
import {POST} from '@/app/api/customer/wallet/topup/create/route';
const pending={id:'tx',customerId:'customer',type:'TOPUP',status:'PENDING',gatewayOrderId:'order_test',amount:10.01};
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({role:'CUSTOMER',customerId:'customer'});m.find.mockResolvedValue({...pending});m.key.mockReturnValue('rzp_test_key');});
async function request(amount=10.01){return POST(new Request('http://localhost/api/customer/wallet/topup/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount,idempotencyKey:'attempt'})}) as any);}
describe('wallet topup retries',()=>{
 it('returns a complete checkout for an existing pending order including public key',async()=>{const res=await request();expect(res.status).toBe(200);expect(await res.json()).toMatchObject({success:true,data:{key:'rzp_test_key',amount:1001,gatewayOrderId:'order_test'}});expect(m.quote).not.toHaveBeenCalled();});
 it.each([{status:'FAILED'},{status:'SUCCESS'},{gatewayOrderId:null},{type:'DEBIT'},{amount:11},{customerId:'other'}])('rejects an unusable or mismatched retry %j',async change=>{m.find.mockResolvedValue({...pending,...change});expect((await request()).status).toBe(409);});
 it('rejects fractions smaller than one paise',async()=>{expect((await request(10.001)).status).toBe(400);});
 it('rejects missing configuration without opening incomplete checkout',async()=>{m.key.mockReturnValue(null);expect((await request()).status).toBe(503);});
});
