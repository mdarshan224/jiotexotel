import {readFileSync,readdirSync} from 'node:fs';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import {PrismaClient} from '@prisma/client';
import {AtomicD1} from '../../lib/sitesDatabase';
export async function localDatabase(){
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
return {prisma,sqlite,other:()=>new PrismaClient({adapter:new AtomicD1(binding as any)}),close:async()=>{await prisma.$disconnect();sqlite.close();}};
}
