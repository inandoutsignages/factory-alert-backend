import { getPool, hasDatabase } from './pool';
import { SQL_SCHEMA } from './sql';

export async function initDatabase(): Promise<void> {
  if (!hasDatabase()) {
    console.warn('[db] DATABASE_URL not set — using in-memory storage (data lost on restart)');
    return;
  }

  const pool = getPool();
  try {
    await pool.query(SQL_SCHEMA);
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
    if (code === 'ENETUNREACH' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
      console.error(
        '[db] Cannot reach Supabase from this host. Replace DATABASE_URL with the Session pooler URI from Supabase → Project Settings → Database (not db.*.supabase.co direct connection).'
      );
    }
    throw err;
  }
  console.log('[db] Supabase/PostgreSQL connected — tables ready');
}

export async function checkDatabaseHealth(): Promise<boolean> {
  if (!hasDatabase()) return false;
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
