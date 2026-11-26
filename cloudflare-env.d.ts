/// <reference types="@cloudflare/workers-types" />
declare namespace Cloudflare { interface Env { DB: D1Database; BUCKET: R2Bucket; CONNECTORS?: any; } }
declare module 'sql.js/dist/sql-asm.js' { import init from 'sql.js'; export default init; }
// Application handlers validate request/response bodies at their boundaries.
interface Response { json(): Promise<any>; }
interface Request { json(): Promise<any>; }
