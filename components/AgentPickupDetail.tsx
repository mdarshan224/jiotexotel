'use client';
import WeightAdjustmentPayment from './WeightAdjustmentPayment';
import Link from '@/components/AppLink';
import {AgentPickupOtp} from '@/components/PickupVerification';
import OrderCallButton from '@/components/OrderCallButton';
import { isTerminalOrderStatus } from '@/lib/trackingLocation';
const money = (value: unknown) => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR'}).format(Number(value) || 0);
export default function AgentPickupDetail({order}: {order: any}) {
  const active = !isTerminalOrderStatus(order.status);
  return <main className="min-h-screen bg-slate-950 text-slate-100 px-4 pt-6 pb-28"><div className="mx-auto max-w-3xl space-y-5">
    <Link href="/agent" className="inline-flex rounded-xl bg-slate-800 px-4 py-3 text-base font-semibold">Your pickups</Link>
    <header className="rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-3"><p className="text-emerald-400 font-semibold">Pickup details</p><h1 className="text-2xl font-bold break-all">#{order.orderNumber}</h1><p>{String(order.status || '').replaceAll('_',' ')}</p>{order.createdAt && <p className="text-slate-400">{new Date(order.createdAt).toLocaleString('en-IN')}</p>}</header>
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-3"><h2 className="text-xl font-bold">{order.customer?.user?.name || 'Customer'}</h2><p className="leading-relaxed">{[order.address?.houseNo,order.address?.street,order.address?.area,order.address?.pincode].filter(Boolean).join(', ') || 'Address available after assignment'}</p>{order.address?.pickupInstructions && <p className="text-slate-300">{order.address.pickupInstructions}</p>}{active && order.agentId && <OrderCallButton portal="AGENT" orderId={order.id} label="Call customer" className="w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold disabled:opacity-50"/>}</section>
    {['AGENT_ARRIVED','WASTE_VERIFICATION','WEIGHING'].includes(order.status) && <AgentPickupOtp orderId={order.id} verified={!!order.pickupStartVerified} onVerified={()=>window.location.reload()}/>}
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6"><h2 className="text-xl font-bold mb-4">Pickup items</h2><div className="divide-y divide-slate-700">{(order.items || []).map((item: any) => <div key={item.id} className="py-4 flex justify-between gap-4"><div><p className="font-semibold">{item.category?.name || 'Material'}</p><p className="text-slate-400 text-sm">{item.actualWeight ?? item.estimatedWeight ?? 0} kg · {money(item.ratePerKg)}/kg</p></div><p>{money(item.subtotal)}</p></div>)}</div><div className="border-t border-slate-700 pt-4 flex justify-between font-bold"><span>Final pickup value</span><span>{money(order.finalAmount)}</span></div></section>
    <WeightAdjustmentPayment orderId={order.id} role="AGENT" initial={order.weightAdjustment}/>
    {active ? <Link href="/agent#agent-current-job" className="block text-center rounded-2xl bg-emerald-600 p-4 font-bold">Continue pickup</Link> : <Link href="/agent/wallet" className="block text-center rounded-2xl bg-emerald-600 p-4 font-bold">View earnings in wallet</Link>}
  </div></main>;
}
