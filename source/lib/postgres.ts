import { Pool, type PoolClient, type QueryResult } from "pg";

export type PostgreSQLResult<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: { changes: number };
};

// Existing application queries use ? parameters; PostgreSQL receives only $N parameters.
export function postgresPlaceholders(sql: string): { text: string; count: number } {
  let text = "";
  let count = 0;
  let position = 0;
  let nativeParameter = false;
  let nativeCount = 0;
  while (position < sql.length) {
    const character = sql[position];
    if (character === "'" || character === '"') {
      const quote = character;
      const escapedString = quote === "'" && /(?:^|[^A-Za-z0-9_$])[eE]$/.test(sql.slice(0, position));
      text += character; position++;
      let closed = false;
      while (position < sql.length) {
        const current = sql[position++]; text += current;
        if (escapedString && current === "\\" && position < sql.length) { text += sql[position++]; continue; }
        if (current !== quote) continue;
        if (sql[position] === quote) { text += sql[position++]; continue; }
        closed = true; break;
      }
      if (!closed) throw new Error("Unclosed SQL quote.");
      continue;
    }
    if (sql.startsWith("--", position)) {
      const end = sql.indexOf("\n", position);
      const next = end === -1 ? sql.length : end + 1;
      text += sql.slice(position, next); position = next; continue;
    }
    if (sql.startsWith("/*", position)) {
      let depth = 1;
      text += "/*"; position += 2;
      while (position < sql.length && depth) {
        if (sql.startsWith("/*", position)) { text += "/*"; position += 2; depth++; }
        else if (sql.startsWith("*/", position)) { text += "*/"; position += 2; depth--; }
        else text += sql[position++];
      }
      if (depth) throw new Error("Unclosed SQL comment.");
      continue;
    }
    if (character === "$") {
      const delimiter = /^(?:\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$)/.exec(sql.slice(position))?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, position + delimiter.length);
        if (end === -1) throw new Error("Unclosed SQL dollar quote.");
        const next = end + delimiter.length;
        text += sql.slice(position, next); position = next; continue;
      }
      const parameter = /^\$(\d+)/.exec(sql.slice(position));
      if (parameter) { nativeParameter = true; nativeCount = Math.max(nativeCount, Number(parameter[1])); text += parameter[0]; position += parameter[0].length; continue; }
    }
    if (character === "?") { count++; text += "$" + count; }
    else text += character;
    position++;
  }
  if (count && nativeParameter) throw new Error("Do not mix SQL parameter styles.");
  return { text, count: nativeCount || count };
}

function result<T>(query: QueryResult): PostgreSQLResult<T> {
  return { results: query.rows as T[], success: true, meta: { changes: ["INSERT", "UPDATE", "DELETE", "MERGE"].includes(query.command) ? query.rowCount ?? 0 : 0 } };
}

export class PostgreSQLStatement {
  readonly database: PostgreSQLDatabase;
  readonly text: string;
  readonly parameterCount: number;
  readonly values: readonly unknown[];

  constructor(database: PostgreSQLDatabase, sql: string, values: readonly unknown[] = []) {
    this.database = database;
    const compiled = postgresPlaceholders(sql);
    this.text = compiled.text;
    this.parameterCount = compiled.count;
    this.values = values;
  }

  bind(...values: unknown[]): PostgreSQLStatement {
    if (values.length !== this.parameterCount) throw new Error("SQL parameter count does not match.");
    return new PostgreSQLStatement(this.database, this.text, values);
  }

  async execute<T>(connection: Pool | PoolClient): Promise<PostgreSQLResult<T>> {
    if (this.values.length !== this.parameterCount) throw new Error("SQL parameters have not been bound.");
    return result<T>(await connection.query(this.text, [...this.values]));
  }

  async all<T = Record<string, unknown>>(): Promise<PostgreSQLResult<T>> { return this.execute<T>(this.database.pool); }
  async first<T = Record<string, unknown>>(): Promise<T | null> { return (await this.all<T>()).results[0] ?? null; }
  async run<T = Record<string, unknown>>(): Promise<PostgreSQLResult<T>> { return this.all<T>(); }
}

export class PostgreSQLDatabase {
  readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }
  prepare(sql: string): PostgreSQLStatement { return new PostgreSQLStatement(this, sql); }

  async batch<T = Record<string, unknown>>(statements: readonly PostgreSQLStatement[]): Promise<PostgreSQLResult<T>[]> {
    if (statements.some(statement => statement.database !== this)) throw new Error("SQL batch statements must use the same database.");
    if (!statements.length) return [];
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const results: PostgreSQLResult<T>[] = [];
      for (const statement of statements) results.push(await statement.execute<T>(connection));
      await connection.query("COMMIT");
      return results;
    } catch (error) {
      try { await connection.query("ROLLBACK"); } catch { /* Preserve the original query failure. */ }
      throw error;
    } finally { connection.release(); }
  }
}

const state = globalThis as typeof globalThis & { shreekamalineePostgres?: PostgreSQLDatabase };

export function getDatabase(): PostgreSQLDatabase {
  if (!state.shreekamalineePostgres) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured.");
    const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
    pool.on("error", () => console.error("A PostgreSQL connection was interrupted."));
    state.shreekamalineePostgres = new PostgreSQLDatabase(pool);
  }
  return state.shreekamalineePostgres;
}

export function getPostgresPool(): Pool { return getDatabase().pool; }
