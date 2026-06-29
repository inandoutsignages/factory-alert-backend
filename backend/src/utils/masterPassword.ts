import { timingSafeEqual } from 'crypto';

function resolveMasterPassword(): string {
  const fromEnv = process.env.MASTER_PASSWORD?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: MASTER_PASSWORD must be set in .env before running in production.');
    process.exit(1);
  }

  console.warn('[auth] MASTER_PASSWORD not set — using dev default. Set MASTER_PASSWORD in .env.');
  return 'FactoryAlert@2026';
}

const MASTER_PASSWORD = resolveMasterPassword();

export function verifyMasterPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;

  const expected = Buffer.from(MASTER_PASSWORD, 'utf8');
  const provided = Buffer.from(password, 'utf8');

  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
