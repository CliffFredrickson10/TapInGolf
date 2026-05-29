import mysql from "mysql2/promise";
import { logger } from "./logger";

// ── HTTP Proxy mode ───────────────────────────────────────────────────────────
// When DB_PROXY_URL is set the server talks to a PHP proxy over HTTPS instead
// of opening a direct TCP connection to port 3306 (which Replit blocks).

const PROXY_URL = process.env["DB_PROXY_URL"];
const PROXY_KEY = process.env["DB_PROXY_KEY"] ?? "tapin-proxy-2026-xK9mQzR7pL";

async function proxyRequest(type: string, sql: string, params: any[]): Promise<any> {
  const res = await fetch(PROXY_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Key": PROXY_KEY,
    },
    body: JSON.stringify({ type, sql, params }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DB proxy error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Direct MySQL pool (used when DB_PROXY_URL is not set) ─────────────────────
let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env["MYSQL_HOST"],
      port: parseInt(process.env["MYSQL_PORT"] ?? "3306"),
      database: process.env["MYSQL_DATABASE"],
      user: process.env["MYSQL_USER"],
      password: process.env["MYSQL_PASSWORD"],
      waitForConnections: true,
      connectionLimit: 50,
      queueLimit: 100,
      charset: "utf8mb4",
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 15000,
    });

    setInterval(async () => {
      try {
        const conn = await pool!.getConnection();
        await conn.ping();
        conn.release();
      } catch {
        // pool will reconnect on next query
      }
    }, 30_000);

    logger.info("MySQL pool created");
  }
  return pool;
}

// ── Proxy-aware execute (mirrors pool.execute return shape) ───────────────────
// Returns [rows | ResultSetHeader, []] so migrate.ts needs no structural changes.

export async function execute(sql: string, params: any[] = []): Promise<[any, any[]]> {
  if (PROXY_URL) {
    const upper = sql.trimStart().toUpperCase();
    const isSelect = upper.startsWith("SELECT") || upper.startsWith("SHOW") || upper.startsWith("DESCRIBE");
    const result = await proxyRequest(isSelect ? "query" : "exec", sql, params);
    return [result, []];
  }
  return getPool().execute(sql, params) as Promise<[any, any[]]>;
}

// ── Public query helpers ──────────────────────────────────────────────────────

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (PROXY_URL) return proxyRequest("query", sql, params) as Promise<T[]>;
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}

export async function row<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  if (PROXY_URL) return proxyRequest("row", sql, params) as Promise<T | null>;
  const rows = await query<T>(sql, params);
  return (rows[0] as T) ?? null;
}

export async function exec(sql: string, params: any[] = []): Promise<number> {
  if (PROXY_URL) {
    const r = await proxyRequest("exec", sql, params);
    return r.insertId ?? 0;
  }
  const [result] = await getPool().execute(sql, params);
  return (result as mysql.ResultSetHeader).insertId;
}

export async function run(sql: string, params: any[] = []): Promise<number> {
  if (PROXY_URL) {
    const r = await proxyRequest("run", sql, params);
    return r.affectedRows ?? 0;
  }
  const [result] = await getPool().execute(sql, params);
  return (result as mysql.ResultSetHeader).affectedRows;
}
