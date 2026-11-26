'use client';
import {agentFetch} from '@/lib/agentFetch';
import {useEffect,useRef,useState} from 'react';
type Call={id:string;status:string;duration:number|null;createdAt:string};
const active=['CREATING','UNKNOWN','queued','in-progress'];
export default function OrderCallButton({orderId,label,fallbackPhone,className='',portal='CUSTOMER'}:{orderId:string;label:string;fallbackPhone?:string;className?:string;portal?:'CUSTOMER'|'AGENT'}) {
 const request=portal==='AGENT'?agentFetch:fetch;
 const [config,setConfig]=useState<{enabled:boolean;ready:boolean}|null>(null);
 const [call,setCall]=useState<Call|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),attempt=useRef('');
 const key='jio-voice-attempt:'+orderId;
 useEffect(()=>{let mounted=true;request('/api/voice/config',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.json()).then(r=>{if(mounted && r.success)setConfig(r.data);}).catch(()=>{if(mounted)setMessage('Calling is temporarily unavailable.');});return()=>{mounted=false;};},[]);
 async function refresh(){try{const r=await request(`/api/orders/${orderId}/call`,{cache:'no-store',signal:AbortSignal.timeout(15000)});const result=await r.json();if(r.ok && result.success){setCall(result.data);return result.data as Call|null;}setMessage(result.message||'Call status is unavailable.');}catch{setMessage('Call status could not be refreshed. Please check before trying again.');}return null;}
 useEffect(()=>{setCall(null);setMessage('');attempt.current='';if(config?.ready)void refresh();},[orderId,config?.ready]);
 useEffect(()=>{if(!call || !active.includes(call.status) || Date.now()-new Date(call.createdAt).getTime()>660000)return;const timer=setInterval(()=>void refresh(),15000);return()=>clearInterval(timer);},[call?.id,call?.status,config?.ready,orderId]);
 async function start(){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try {
   const previous=await refresh();
   if(previous && active.includes(previous.status) && Date.now()-new Date(previous.createdAt).getTime()<660000){setMessage('A call is already starting or awaiting confirmation. Please answer your registered mobile.');return;}
   if(previous && (!active.includes(previous.status) || Date.now()-new Date(previous.createdAt).getTime()>=660000)){attempt.current='';try{sessionStorage.removeItem(key);}catch{}}
   if(!attempt.current){try{attempt.current=sessionStorage.getItem(key)||'';}catch{}attempt.current ||= crypto.randomUUID();try{sessionStorage.setItem(key,attempt.current);}catch{}}
   const r=await request(`/api/orders/${orderId}/call`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:attempt.current}),signal:AbortSignal.timeout(25000)});
   const result=await r.json();if(!r.ok || !result.success)throw new Error(result.message||'Call request could not be confirmed.');
   setCall(result.data);setMessage(result.data.status==='UNKNOWN'?'The previous request is awaiting confirmation. Check your call status before trying again.':'Answer the call on your registered mobile. We will then connect the other person.');
  }catch(error){setMessage(error instanceof Error?error.message:'Calling is unavailable.');void refresh();}
  finally{lock.current=false;setBusy(false);}
 }
 if(config && !config.enabled && fallbackPhone)return <a href={`tel:${fallbackPhone}`} className={className}>{label}</a>;
 return <div className="w-full space-y-2">
  <button type="button" className={className} disabled={busy || !config?.ready} onClick={()=>void start()}>{busy?'Requesting call…':label}</button>
  {config?.enabled && !config.ready && <p className="text-xs" role="status">Calling setup is pending. Contact dispatch for help.</p>}
  <p className="text-xs text-slate-500">Calls are recorded for service quality.</p>
  {message && <p role="status" className="text-xs leading-relaxed">{message}</p>}
  {call && <div className="text-xs"><span>Call: {call.status==='UNKNOWN'?'awaiting provider confirmation':call.status.replaceAll('-',' ')}{call.duration!=null?` · ${call.duration}s`:''}</span><button type="button" onClick={()=>void refresh()} className="ml-2 underline">Check status</button></div>}
 </div>;
}
