import { Pool, type PoolClient } from "pg";
import { logger } from "./logger";

// Convert MySQL-style ? placeholders to PostgreSQL $1, $2, ...
function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Normalise MySQL-specific DDL tokens so pg won't choke if any slip through
function cleanSql(sql: string): string {
  return sql
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/\bENGINE\s*=\s*\w+/gi, "")
    .replace(/\bDEFAULT\s+CHARSET\s*=\s*\w+/gi, "")
    .replace(/\bCOLLATE\s*=?\s*\S+/gi, "")
    .replace(/\bCOLLATE\s+\S+/gi, "");
}

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env["DATABASE_URL"],
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    _pool.on("error", (err) => {
      logger.error({ err }, "PostgreSQL pool error");
    });
    logger.info("PostgreSQL pool created");
  }
  return _pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const result = await getPool().query(toPositional(cleanSql(sql)), params);
  return result.rows as T[];
}

export async function row<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// exec() — for INSERT statements, returns the new row's id (0 if nothing inserted)
export async function exec(sql: string, params: any[] = []): Promise<number> {
  let s = cleanSql(sql);
  const isInsert = /^\s*INSERT/i.test(s);
  if (isInsert && !/RETURNING/i.test(s)) {
    s = s.trimEnd().replace(/;$/, "") + " RETURNING *";
  }
  const result = await getPool().query(toPositional(s), params);
  if (isInsert) return (result.rows[0]?.id as number) ?? 0;
  return result.rowCount ?? 0;
}

// run() — for UPDATE/DELETE, returns affected row count
export async function run(sql: string, params: any[] = []): Promise<number> {
  const result = await getPool().query(toPositional(cleanSql(sql)), params);
  return result.rowCount ?? 0;
}

// execute() — mirrors mysql2 execute() return shape [rows|header, []] for
// backward-compat with migrate.ts and any other callers that destructure the result.
export async function execute(sql: string, params: any[] = []): Promise<[any, any[]]> {
  let s = cleanSql(sql);
  const upper = s.trimStart().toUpperCase();
  const isInsert = upper.startsWith("INSERT");
  const isDML = upper.startsWith("UPDATE") || upper.startsWith("DELETE");

  if (isInsert && !/RETURNING/i.test(s)) {
    s = s.trimEnd().replace(/;$/, "") + " RETURNING *";
  }

  const result = await getPool().query(toPositional(s), params);

  if (isInsert) {
    return [{ insertId: (result.rows[0]?.id as number) ?? 0, affectedRows: result.rowCount ?? 0 }, []];
  }
  if (isDML) {
    return [{ insertId: 0, affectedRows: result.rowCount ?? 0 }, []];
  }
  return [result.rows, []];
}

// withTransaction — run a block of queries atomically
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// clientQuery — run a single query on a transaction client (auto-converts ? → $N)
export async function clientQuery(
  client: PoolClient,
  sql: string,
  params: any[] = []
): Promise<import("pg").QueryResult> {
  return client.query(toPositional(cleanSql(sql)), params);
}
