import {describe,it,expect} from 'vitest';
import {runWithRequestScope,requestValue} from '@/lib/requestScope';
describe('Worker request isolation',()=>{
 it('reuses clients inside a request but never across concurrent requests',async()=>{
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  const first=runWithRequestScope(async()=>{const client=requestValue('client',()=>({id:'first'}));await gate;expect(requestValue('client',()=>({id:'wrong'}))).toBe(client);return client;});
  const second=await runWithRequestScope(async()=>requestValue('client',()=>({id:'second'})));release();expect((await first).id).toBe('first');expect(second.id).toBe('second');
 });
 it('does not persist a pending I/O promise outside a request scope',()=>{expect(requestValue('outside',()=>({}))).not.toBe(requestValue('outside',()=>({})));});
});
