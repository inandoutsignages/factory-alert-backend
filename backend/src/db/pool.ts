import { Pool } from 'pg';

let pool: Pool | null = null;

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!.trim();
    const useSsl = url.includes('supabase') || process.env.NODE_ENV === 'production';
    pool = new Pool({
      connectionString: url,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
