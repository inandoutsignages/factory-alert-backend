import { getPool, hasDatabase } from './pool';
import { SQL_SCHEMA } from './sql';

export async function initDatabase(): Promise<void> {
  if (!hasDatabase()) {
    console.warn('[db] DATABASE_URL not set — using in-memory storage (data lost on restart)');
    return;
  }

  const pool = getPool();
  await pool.query(SQL_SCHEMA);
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
