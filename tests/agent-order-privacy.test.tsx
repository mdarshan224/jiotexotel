import React from 'react';
import {renderToString} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
vi.mock('@/components/AppLink',()=>({default:({children,...props}:any)=><a {...props}>{children}</a>}));
vi.mock('@/components/OrderCallButton',()=>({default:()=>null}));
import {agentOrder,agentEvent,redactContactText} from '@/lib/orders/agentOrder';
import AgentPickupDetail from '@/components/AgentPickupDetail';
const order={id:'order-1',orderNumber:'JIO-1',status:'PICKUP_COMPLETED',finalAmount:80,customer:{user:{name:'Customer',phone:'7000000011',email:'private@example.com'}},address:{phone:'7000000011',street:'Call +91 70000 00011 near park',area:'JP Nagar'},items:[{id:'item-1',ratePerKg:20,actualWeight:4,category:{name:'Paper'}}],invoices:[{pdfDataJson:'private'}],notes:'7000000011',payments:[{phone:'7000000011'}]};
describe('Agent pickup page and privacy boundary',()=>{
 it('uses a closed projection and redacts contact details in free text',()=>{
  const result=agentOrder(order),text=JSON.stringify(result);expect(result.items[0].subtotal).toBe(80);expect(text).not.toContain('7000000011');expect(text).not.toContain('70000 00011');expect(text).not.toContain('private@example.com');expect(result).not.toHaveProperty('invoices');expect(result).not.toHaveProperty('payments');expect(result.address).not.toHaveProperty('phone');
 });
 it('renders an assigned pickup with the former missing subtotal and no customer checkout controls',()=>{
  const html=renderToString(<AgentPickupDetail order={agentOrder(order)}/>);expect(html).toContain('Paper');expect(html).toContain('80.00');expect(html).toContain('View earnings in wallet');expect(html).not.toContain('7000000011');expect(html).not.toContain('Pay Now');
 });
 it('forwards SSE identifiers without nested orders or raw notification content',()=>{
  const event=agentEvent({...order,message:'Call 7000000011',customerPhone:'7000000011'});expect(event.orderId).toBe('order-1');expect(JSON.stringify(event)).not.toContain('7000000011');expect(event).not.toHaveProperty('customer');
 });
 it.each(['7000000011','+917000000011','+91 70000 00011','(700) 000-0011'])('redacts embedded phone %s',phone=>expect(redactContactText('Reach '+phone)).not.toContain(phone));
});
