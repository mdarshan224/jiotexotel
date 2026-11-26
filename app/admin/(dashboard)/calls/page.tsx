'use client';
import Link from '@/components/AppLink';
import {useEffect,useRef,useState} from 'react';
import {PhoneCall,Search,RefreshCw,CheckCircle2} from 'lucide-react';
type Customer={id:string;name:string;phone:string};
type Call={id:string;customerId:string;status:string;duration:number|null;createdAt:string;teamPhoneLast4:string;customerName?:string;customerPhone?:string;initiatedBy?:string};
const activeStatuses=['CREATING','UNKNOWN','queued','in-progress'];
function inFlight(call:Call|null){return Boolean(call && activeStatuses.includes(call.status) && Date.now()-new Date(call.createdAt).getTime()<660000);}
export default function AdminCustomerCalls(){
 const [query,setQuery]=useState(''),[customers,setCustomers]=useState<Customer[]>([]),[selected,setSelected]=useState<Customer|null>(null),[teamPhone,setTeamPhone]=useState('');
 const [calls,setCalls]=useState<Call[]>([]),[current,setCurrent]=useState<Call|null>(null),[ready,setReady]=useState(false);
 const [searching,setSearching]=useState(true),[calling,setCalling]=useState(false),[refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState(''),[searchError,setSearchError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),statusLock=useRef(false),attempt=useRef({id:'',payload:''});
 useEffect(()=>{
  const controller=new AbortController();setSearching(true);setSearchError('');
  const timer=setTimeout(async()=>{try{const r=await fetch('/api/admin/voice/customers?q='+encodeURIComponent(query),{cache:'no-store',signal:controller.signal});const data=await r.json();if(!r.ok || !data.success)throw new Error(data.message||'Customer search failed.');if(!controller.signal.aborted)setCustomers(data.data);}catch(e){if(!controller.signal.aborted)setSearchError(e instanceof Error?e.message:'Search unavailable.');}finally{if(!controller.signal.aborted)setSearching(false);}},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query]);
 async function loadHistory(){
  setRefreshing(true);
  try{const r=await fetch('/api/admin/voice/calls',{cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok || !data.success)throw new Error(data.message||'Call history could not be loaded.');setCalls(data.data);setReady(data.callingReady);return data.data as Call[];}catch(e){setError(e instanceof Error?e.message:'History unavailable.');return [];}finally{setRefreshing(false);}
 }
 useEffect(()=>{void loadHistory();},[]);
 async function checkStatus(id:string){
  if(statusLock.current)return;statusLock.current=true;
  try{const r=await fetch('/api/admin/voice/calls?callId='+encodeURIComponent(id),{cache:'no-store',signal:AbortSignal.timeout(20000)});const result=await r.json();if(!r.ok || !result.success)throw new Error(result.message||'Status is unavailable.');setCurrent(previous=>previous?.id===id?{...previous,...result.data}:previous);setCalls(previous=>previous.map(row=>row.id===id?{...row,...result.data}:row));}catch(e){setError(e instanceof Error?e.message:'Call status unavailable.');}finally{statusLock.current=false;}
 }
 useEffect(()=>{if(!inFlight(current))return;const timer=setInterval(()=>void checkStatus(current!.id),15000);return()=>clearInterval(timer);},[current?.id,current?.status]);
 async function start(e:React.FormEvent){
  e.preventDefault();if(lock.current || !selected)return;lock.current=true;setCalling(true);setError('');setNotice('');
  const payload=JSON.stringify({customerId:selected.id,teamPhone:teamPhone.replace(/[\s()-]/g,'')});
  if(attempt.current.payload!==payload || (current && !inFlight(current)))attempt.current={id:crypto.randomUUID(),payload};
  if(!attempt.current.id)attempt.current={id:crypto.randomUUID(),payload};
  try{
   const r=await fetch('/api/admin/voice/calls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerId:selected.id,teamPhone,attemptId:attempt.current.id}),signal:AbortSignal.timeout(25000)});
   const result=await r.json();if(!r.ok || !result.success)throw new Error(result.message||'Call request could not be confirmed.');
   setCurrent(result.data);setNotice(result.data.status==='UNKNOWN'?'The call is awaiting provider confirmation. Check its status before retrying.':'Answer the call on the team mobile you entered. The customer will be dialled after you answer.');
  }catch(e){setError(e instanceof Error?e.message:'Call request could not be confirmed. Check recent calls before retrying.');}
  finally{await loadHistory();lock.current=false;setCalling(false);}
 }
 return <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-widest text-emerald-700">CUSTOMER SUPPORT</p><h1 className="text-3xl font-bold mt-2 text-slate-900">Call a customer</h1><p className="text-sm text-slate-600 mt-2">Your team mobile rings first. Answer to connect with the selected customer through the business number. All calls are recorded for service quality.</p></div><Link href="/admin/integrations/exotel" className="text-sm font-semibold text-emerald-700 underline">Calling settings</Link></header>
  {error && <p role="alert" className="bg-rose-50 text-rose-800 border border-rose-200 p-4 rounded-2xl text-sm">{error}</p>}
  {notice && <p role="status" className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-4 rounded-2xl text-sm">{notice}</p>}
  <div className="grid lg:grid-cols-2 gap-6">
   <section className="bg-white border rounded-2xl p-5 space-y-4"><h2 className="text-lg font-bold text-slate-900">Select customer</h2><label className="block text-sm font-medium">Search name or mobile<div className="flex mt-2 items-center border rounded-xl px-3"><Search className="w-4 h-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} className="w-full p-3 outline-none bg-transparent text-slate-900" placeholder="Customer name or mobile number" /></div></label>
    {searchError && <p role="alert" className="text-sm text-rose-700">{searchError}</p>}
    <p role="status" className="text-xs text-slate-500">{searching?'Searching customers…':'Showing up to 20 matches. Search to find another customer.'}</p>
    <div className="max-h-80 overflow-y-auto space-y-2" aria-label="Customer results">
     {!searching && !searchError && customers.length===0 && <p className="py-5 text-sm text-slate-500">No active customers match this search.</p>}
     {customers.map(customer=><button type="button" disabled={calling} key={customer.id} onClick={()=>{setSelected(customer);setError('');}} aria-pressed={selected?.id===customer.id} className={`w-full text-left p-3 rounded-xl border flex items-center justify-between gap-3 disabled:opacity-50 ${selected?.id===customer.id?'border-emerald-500 bg-emerald-50':'border-slate-200 hover:bg-slate-50'}`}><span><strong className="block text-sm text-slate-900">{customer.name}</strong><span className="text-sm text-slate-600">{customer.phone}</span></span>{selected?.id===customer.id && <CheckCircle2 className="text-emerald-700 w-5 h-5"/>}</button>)}
    </div>
   </section>
   <form onSubmit={start} className="bg-white border rounded-2xl p-5 space-y-5"><h2 className="text-lg font-bold text-slate-900">Connect the call</h2>
    <div className="p-4 bg-slate-50 rounded-xl text-sm"><span className="block text-xs text-slate-500 mb-1">CUSTOMER TO CALL</span><strong className="text-slate-900">{selected?.name || 'Choose a customer from the list'}</strong>{selected && <p className="mt-1 text-slate-600">{selected.phone}</p>}</div>
    <label className="block text-sm font-medium text-slate-800">Support / team mobile number<input value={teamPhone} onChange={e=>setTeamPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="off" maxLength={20} required disabled={calling} placeholder="Enter 10-digit mobile or +91 number" className="mt-2 w-full p-3 border rounded-xl text-slate-900"/><span className="block text-xs text-slate-500 mt-2">Enter the mobile of the team member who will speak with the customer. This phone rings first.</span></label>
    <button type="submit" disabled={!selected || !teamPhone.trim() || !ready || calling || (inFlight(current) && attempt.current.payload===JSON.stringify({customerId:selected?.id,teamPhone:teamPhone.replace(/[\s()-]/g,'')}))} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl px-5 py-3 w-full flex justify-center items-center gap-2 disabled:opacity-50"><PhoneCall size={18}/>{calling?'Requesting call…':'Call customer'}</button>
    {!ready && <p className="text-xs text-amber-700">Calling is unavailable or still loading. Check calling settings if this persists.</p>}
    {current && <div role="status" className="text-sm text-slate-700 border rounded-xl p-3">Latest call: <strong>{current.status==='UNKNOWN'?'Awaiting confirmation':current.status.replaceAll('-',' ')}</strong><button type="button" onClick={()=>void checkStatus(current.id)} className="ml-3 text-emerald-700 underline">Check status</button></div>}
    <p className="text-xs text-slate-500 leading-relaxed">Recording is off. Calls are limited to 10 minutes. Recent attempts are protected against duplicate requests.</p>
   </form>
  </div>
  <section className="bg-white border rounded-2xl p-5 space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Recent support calls</h2><button type="button" onClick={()=>{setError('');void loadHistory();}} disabled={refreshing} className="flex items-center gap-2 text-sm text-emerald-700 disabled:opacity-50"><RefreshCw size={16} className={refreshing?'animate-spin':''}/>Refresh</button></div>
   <p className="text-xs text-slate-500">Latest 50 calls. Team mobiles are shown by their last four digits.</p>
   {calls.length===0 && <p className="text-sm text-slate-500 py-4">No support calls recorded yet.</p>}
   <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b text-slate-500"><th className="p-3">Customer</th><th className="p-3">Team mobile</th><th className="p-3">Initiated by</th><th className="p-3">Time</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{calls.map(call=><tr key={call.id} className="border-b last:border-0 text-slate-700"><td className="p-3"><strong>{call.customerName}</strong><span className="block text-xs text-slate-500">{call.customerPhone}</span></td><td className="p-3 whitespace-nowrap">•••• {call.teamPhoneLast4}</td><td className="p-3">{call.initiatedBy}</td><td className="p-3 whitespace-nowrap">{new Date(call.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td><td className="p-3">{call.status==='UNKNOWN'?'Awaiting confirmation':call.status.replaceAll('-',' ')}{call.duration!=null && <small className="block">{call.duration}s</small>}</td><td className="p-3"><button type="button" onClick={()=>void checkStatus(call.id)} className="text-emerald-700 underline whitespace-nowrap">Check status</button></td></tr>)}</tbody></table></div>
  </section>
 </main>;
}
