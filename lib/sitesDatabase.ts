import { PrismaD1 } from '@prisma/adapter-d1';
import { DriverAdapterError, type SqlDriverAdapterFactory, type SqlDriverAdapter, type Transaction } from '@prisma/driver-adapter-utils';
import initSqlJs from 'sql.js/dist/sql-asm.js';
type SqlJsInit = typeof initSqlJs;

const mutates = (sql: string) => /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const increment = 'UPDATE "_SiteRevision" SET version = version + 1 WHERE id = 1';
let sqlite: Awaited<ReturnType<SqlJsInit>> | undefined;

/**
 * Prisma's ordinary D1 adapter ignores interactive transactions. This adapter
 * instead evaluates each transaction against an isolated SQLite snapshot, then
 * atomically replays writes in a D1 batch guarded by the snapshot revision.
 * Every nontransactional write also increments that revision in its own batch.
 * A stale snapshot fails before any business write, rather than losing updates.
 * This is bounded to the small testing database; oversize snapshots fail closed.
 */
export class AtomicD1 implements SqlDriverAdapterFactory {
  readonly provider = 'sqlite';
  readonly adapterName = 'junkitout-atomic-d1';
  constructor(private readonly binding: D1Database) {}

  async connect(): Promise<SqlDriverAdapter> {
    const live = await new PrismaD1(this.liveBinding() as any).connect();
    live.startTransaction = async () => this.transaction();
    return live;
  }

  private liveBinding() {
    const binding = this.binding;
    function statement(sql: string, args: any[] = []): any {
      const bound = () => binding.prepare(sql).bind(...args);
      async function run() {
        if (!mutates(sql)) return bound().all();
        const results = await binding.batch([bound(), binding.prepare(increment)]);
        return results[0];
      }
      return {
        bind: (...values: any[]) => statement(sql, values),
        run,
        all: run,
        async raw(options?: { columnNames?: boolean }) {
          if (!mutates(sql)) return bound().raw(options as any);
          const data = await run();
          const rows = data.results || [];
          const columns = rows.length ? Object.keys(rows[0] as object) : [];
          const values = rows.map((row: any) => columns.map(key => row[key]));
          return options?.columnNames ? [columns, ...values] : values;
        },
      };
    }
    return { prepare: statement, exec: () => { throw new Error('Use versioned migrations for schema changes.'); } };
  }

  private async transaction(): Promise<Transaction> {
    const schema = await this.binding.prepare("SELECT name, sql, type FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ").all<{name: string;sql: string;type: string}>();
    // SQLite LIKE '_' is a wildcard; filter internal tables explicitly in JS.
    const entries = (schema.results || []).filter(row => !row.name.startsWith('_') && !row.name.startsWith('sqlite_'));
    const tables = entries.filter(row => row.type === 'table');
    if (!tables.length) throw new Error('Application schema is not initialized.');
    const snapshot = await this.binding.batch([
      this.binding.prepare('SELECT version FROM "_SiteRevision" WHERE id = 1'),
      ...tables.map(table => this.binding.prepare(`SELECT * FROM ${quote(table.name)} LIMIT 5001`)),
    ]);
    let rowCount = 0;
    for (const result of snapshot.slice(1)) rowCount += result.results.length;
    if (rowCount > 10000 || snapshot.slice(1).some(result => result.results.length > 5000) || JSON.stringify(snapshot).length > 4 * 1024 * 1024) {
      throw new Error('Testing database transaction capacity reached; archive test data before continuing.');
    }
    const version = (snapshot[0].results[0] as any)?.version;
    if (!Number.isInteger(version)) throw new Error('Database revision metadata missing.');
    const SQL = sqlite ?? await initSqlJs();
    sqlite = SQL;
    const local = new SQL.Database();
    try {
      local.run('PRAGMA foreign_keys = OFF');
      for (const entry of tables) local.run(entry.sql);
      for (let i = 0; i < tables.length; i++) {
        const rows = snapshot[i + 1].results;
        if (!rows.length) continue;
        const columns = Object.keys(rows[0] as object);
        const insert = local.prepare(`INSERT INTO ${quote(tables[i].name)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
        try { for (const row of rows) insert.run(columns.map(column => (row as any)[column])); }
        finally { insert.free(); }
      }
      for (const entry of entries.filter(row => row.type === 'index')) local.run(entry.sql);
      local.run('PRAGMA foreign_keys = ON');
    } catch (error) { local.close(); throw error; }
    const writes: {sql: string;args: any[]}[] = [];
    let closed = false;
    const ensureOpen = () => { if (closed) throw new Error('Transaction is closed.'); };
    function statement(sql: string, args: any[] = []): any {
      function execute() {
        ensureOpen();
        const prepared = local.prepare(sql);
        let columns: string[], values: any[][];
        try {
          prepared.bind(args);
          columns = prepared.getColumnNames(); values = [];
          while (prepared.step()) values.push(prepared.get());
        } finally { prepared.free(); }
        const changes = local.getRowsModified();
        if (mutates(sql)) writes.push({ sql, args });
        return { columns, values, changes };
      }
      return {
        bind: (...values: any[]) => statement(sql, values),
        async raw(options?: {columnNames?: boolean}) { const result = execute(); return options?.columnNames ? [result.columns, ...result.values] : result.values; },
        async run() { const result = execute(); return { success: true, results: [], meta: { changes: result.changes } }; },
      };
    }
    const localAdapter = await new PrismaD1({ prepare: statement } as any).connect();
    return {
      provider: 'sqlite', adapterName: this.adapterName,
      options: { usePhantomQuery: true },
      queryRaw: localAdapter.queryRaw.bind(localAdapter),
      executeRaw: localAdapter.executeRaw.bind(localAdapter),
      commit: async () => {
        ensureOpen();
        try {
          if (writes.length) {
            await this.binding.batch([
              this.binding.prepare('INSERT INTO "_SiteCommitGuard" (expected) VALUES (?)').bind(version),
              ...writes.map(write => this.binding.prepare(write.sql).bind(...write.args)),
              this.binding.prepare(increment),
              this.binding.prepare('DELETE FROM "_SiteCommitGuard"'),
            ]);
          }
        } catch (error) {
          if (String(error).includes('SITE_TRANSACTION_CONFLICT')) throw new DriverAdapterError({ kind: 'TransactionWriteConflict' });
          throw error;
        } finally { closed = true; local.close(); }
      },
      rollback: async () => { if (!closed) { closed = true; local.close(); } },
    };
  }
}
