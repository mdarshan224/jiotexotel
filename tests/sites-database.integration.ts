import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { PrismaClient } from '@prisma/client';
import { AtomicD1 } from '../lib/sitesDatabase';

const SQL = await initSqlJs();
const sqlite = new SQL.Database();
for (const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
sqlite.run('INSERT INTO "_SiteRevision" (id, version) VALUES (1, 0)');
sqlite.run('PRAGMA foreign_keys=ON');
class Statement {
 constructor(public sql:string, public args:any[]=[]){}
 bind(...args:any[]){return new Statement(this.sql,args)}
 private execute(){const q=sqlite.prepare(this.sql);let columns:string[],rows:any[][];try{q.bind(this.args);columns=q.getColumnNames();rows=[];while(q.step())rows.push(q.get());}finally{q.free()}return{columns,rows,changes:sqlite.getRowsModified()}}
 async all(){const r=this.execute();return{success:true,results:r.rows.map(row=>Object.fromEntries(r.columns.map((c,i)=>[c,row[i]]))),meta:{changes:r.changes}}}
 async run(){return this.all()}
 async raw(options?:{columnNames?:boolean}){const r=this.execute();return options?.columnNames?[r.columns,...r.rows]:r.rows}
 async first(){return(await this.all()).results[0]||null}
}
let queue=Promise.resolve();
const binding={prepare(sql:string){return new Statement(sql)},batch(statements:Statement[]){const run=queue.then(async()=>{sqlite.run('BEGIN');try{const r=[];for(const statement of statements)r.push(await statement.all());sqlite.run('COMMIT');return r}catch(e){sqlite.run('ROLLBACK');throw e}});queue=run.then(()=>undefined,()=>undefined);return run}};
const prisma=new PrismaClient({adapter:new AtomicD1(binding as any)});
const prisma2=new PrismaClient({adapter:new AtomicD1(binding as any)});
try{
 const user=await prisma.user.create({data:{phone:'9876543210',name:'Test',customer:{create:{}}},include:{customer:true}});
 assert.ok(user.customer);
 assert.ok(user.createdAt instanceof Date);
 assert.equal(user.role,'CUSTOMER');
 await assert.rejects(prisma.$transaction(async tx=>{await tx.user.create({data:{phone:'7000000000',name:'Rollback'}});throw new Error('abort')}));
 assert.equal(await prisma.user.count({where:{phone:'7000000000'}}),0);
 const wallet=await prisma.customerWallet.create({data:{customerId:user.customer!.id,balance:100,balancePaise:10000}});
 let waiting=0;let release!:()=>void;const barrier=new Promise<void>(resolve=>release=resolve);
 async function debit(client=prisma){return client.$transaction(async tx=>{const current=await tx.customerWallet.findUniqueOrThrow({where:{id:wallet.id}});waiting++;if(waiting===2)release();await barrier;if(current.balance<80)throw new Error('Insufficient');await tx.customerWallet.update({where:{id:wallet.id},data:{balance:{decrement:80}}});await tx.walletTransaction.create({data:{walletId:wallet.id,customerId:user.customer!.id,type:'DEBIT',amount:80}});});}
 const result=await Promise.allSettled([debit(),debit(prisma2)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1,'Only one concurrent debit can commit');
 assert.equal((await prisma.customerWallet.findUniqueOrThrow({where:{id:wallet.id}})).balance,20);
 assert.equal(await prisma.walletTransaction.count(),1,'Failed commit must not leave ledger writes');
 await assert.rejects(prisma.$transaction(async tx=>{await tx.user.update({where:{id:user.id},data:{name:'Stale'}});await prisma2.user.update({where:{id:user.id},data:{name:'Concurrent'}});}));
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).name,'Concurrent','Autocommit must invalidate stale snapshots');
 await prisma.$transaction([prisma.user.update({where:{id:user.id},data:{deletionDueAt:new Date(Date.now()+1000)}}),prisma.user.update({where:{id:user.id},data:{tokenVersion:{increment:1}}})]);
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).tokenVersion,2);
 console.log('PASS: SQLite nested writes, dates, rollback, concurrent wallet guard, atomic ledgers, stale snapshot prevention and array transactions');
}finally{await prisma.$disconnect();await prisma2.$disconnect();sqlite.close()}
