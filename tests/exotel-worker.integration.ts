// No network egress: every provider request is handled by a local fixture Worker.
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`import {connectNumbers,exotelRequest} from './lib/voice/exotel'; export default {async fetch(req){try {const path=new URL(req.url).pathname;if(path==='/connect')return Response.json(await connectNumbers({id:'worker-audit-call',from:'7000000001',to:'7000000002',scope:'support'}));return Response.json(await exotelRequest(path==='/redirect'?'redirect':'Balance.json'));}catch(e){return Response.json({message:e.message},{status:503});}}}`},bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto'],logLevel:'silent'});
const mf=new Miniflare({workers:[{
 name:'application',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],outboundService:'fixture-provider',bindings:{EXOTEL_ACCOUNT_SID:'local-audit',EXOTEL_API_KEY:'local-key',EXOTEL_API_TOKEN:'local-token',EXOTEL_CALLER_ID:'08012345678',EXOTEL_HOST:'api.exotel.com',EXOTEL_ENABLED:'true',JWT_SECRET:'local-runtime-only-key-at-least-thirty-two-characters'},
},{name:'fixture-provider',modules:true,compatibilityDate:'2026-05-15',outboundService:{network:{deny:['0.0.0.0/0','::/0']}},script:`export default {async fetch(req){const path=new URL(req.url).pathname;if(path.endsWith('/redirect'))return new Response('',{status:302,headers:{Location:'https://credentials-must-not-go-here.example/capture'}});if(path.includes('capture'))return Response.json({error:'Redirect was followed incorrectly'},{status:500});if(req.method==='GET')return Response.json({Balance:{Amount:123}});const p=await req.formData();if(p.get('From')!=='+917000000001'||p.get('To')!=='+917000000002'||p.get('Record')!=='true')return Response.json({error:'Bad form'},{status:400});return Response.json({Call:{Sid:'local-worker-call-1234',Status:'queued'}});}}`,
}]});
try{
 const balance=await mf.dispatchFetch('http://local/balance');assert.equal(balance.status,200);assert.deepEqual(await balance.json(),{Balance:{Amount:123}});
 const call=await mf.dispatchFetch('http://local/connect');assert.equal(call.status,200);assert.deepEqual(await call.json(),{sid:'local-worker-call-1234',status:'queued'});
 const redirect=await mf.dispatchFetch('http://local/redirect');assert.equal(redirect.status,503);assert.match((await redirect.json() as any).message,/redirected/);
 console.log('PASS: Actual Worker runtime accepts Exotel balance GET and call POST options; local provider fixtures only; redirects rejected.');
}finally{await mf.dispose();}
