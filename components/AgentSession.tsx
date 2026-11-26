'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {classifyAgentSession,type AgentSessionState} from '@/lib/agentSession';
const AgentSessionContext=createContext<{session:AgentSessionState;refresh:()=>Promise<AgentSessionState>;logout:()=>Promise<void>}|null>(null);
export function AgentSessionProvider({children}:{children:React.ReactNode}){
 const[session,setSession]=useState<AgentSessionState>({status:'checking',user:null});
 const channel=useRef<BroadcastChannel|null>(null);
 const currentRequest=useRef<AbortController|null>(null),mounted=useRef(true);
 const refresh=useCallback(async()=>{
  currentRequest.current?.abort();const controller=new AbortController();currentRequest.current=controller;
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch('/api/auth/me?portal=agent',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
   if(!response.ok&&response.status!==401)throw new Error('Session check failed');
   const next=classifyAgentSession(await response.json());if(mounted.current&&currentRequest.current===controller)setSession(next);return next;
  }catch(error){const next:AgentSessionState={status:'error',user:null};if(mounted.current&&currentRequest.current===controller)setSession(next);return next;}finally{clearTimeout(timeout);}
 },[]);
 const logout=useCallback(async()=>{
  currentRequest.current?.abort();const response=await fetch('/api/auth/agent-logout',{method:'POST',credentials:'same-origin'});
  if(!response.ok)throw new Error('Could not sign out. Please try again.');
  channel.current?.postMessage('signed-out');
  setSession({status:'guest',user:null});window.dispatchEvent(new Event('jio_agent_auth_change'));
 },[]);
 useEffect(()=>{mounted.current=true;void refresh();const changed=()=>{setSession({status:'checking',user:null});void refresh();};const hide=()=>{currentRequest.current?.abort();flushSync(()=>setSession({status:'checking',user:null}));};try{channel.current=new BroadcastChannel('jio-partner-session');channel.current.onmessage=changed;}catch{}const visible=()=>{if(document.visibilityState==='visible')void refresh();};const restored=(event:PageTransitionEvent)=>{if(event.persisted){setSession({status:'checking',user:null});void refresh();}};window.addEventListener('jio_agent_auth_change',changed);window.addEventListener('jio_auth_change',changed);window.addEventListener('pageshow',restored);window.addEventListener('pagehide',hide);document.addEventListener('visibilitychange',visible);return()=>{mounted.current=false;currentRequest.current?.abort();window.removeEventListener('jio_agent_auth_change',changed);window.removeEventListener('jio_auth_change',changed);window.removeEventListener('pageshow',restored);window.removeEventListener('pagehide',hide);channel.current?.close();channel.current=null;document.removeEventListener('visibilitychange',visible);};},[refresh]);
 return <AgentSessionContext.Provider value={{session,refresh,logout}}>{children}</AgentSessionContext.Provider>;
}
export function useAgentSession(){const context=useContext(AgentSessionContext);if(!context)throw new Error('Agent session provider is required.');return context;}
