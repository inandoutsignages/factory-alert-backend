import { randomUUID, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import * as store from '../db/store';

export interface AuthRequest extends Request {
  user?: {
    role: 'super_admin' | 'company_admin' | 'worker';
    company_code?: string;
    company_name?: string;
    worker_id?: string;
  };
}

interface Session {
  role: 'super_admin' | 'company_admin' | 'worker';
  company_code?: string;
  company_name?: string;
  worker_id?: string;
  createdAt: number;
}

const sessions = new Map<string, Session>();

const SESSION_TTL_MS: Record<string, number> = {
  super_admin: 24 * 60 * 60 * 1000,
  company_admin: 7 * 24 * 60 * 60 * 1000,
  worker: 7 * 24 * 60 * 60 * 1000,
};

export function createSession(
  user: Omit<Session, 'createdAt'>,
  expiresIn = '7d'
): string {
  const token = randomUUID();
  const ttl =
    expiresIn === '24h'
      ? SESSION_TTL_MS.super_admin
      : SESSION_TTL_MS[user.role] ?? SESSION_TTL_MS.worker;

  sessions.set(token, { ...user, createdAt: Date.now() });

  // Auto-expire session after TTL
  setTimeout(() => sessions.delete(token), ttl).unref?.();

  return token;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

export function destroySessionsForCompany(company_code: string): void {
  for (const [token, session] of sessions.entries()) {
    if (session.company_code === company_code) {
      sessions.delete(token);
    }
  }
}

function getSession(token: string): Session | null {
  const session = sessions.get(token);
  if (!session) return null;

  const ttl = SESSION_TTL_MS[session.role] ?? SESSION_TTL_MS.worker;
  if (Date.now() - session.createdAt > ttl) {
    sessions.delete(token);
    return null;
  }

  return session;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.user = {
    role: session.role,
    company_code: session.company_code,
    company_name: session.company_name,
    worker_id: session.worker_id,
  };
  next();
};

export const superAdminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

export const companyAdminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'company_admin') {
    return res.status(403).json({ error: 'Company admin access required' });
  }
  next();
};

export const requireActiveCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const company_code = req.user?.company_code;
  if (!company_code) return next();

  const company = await store.findCompanyByCode(company_code);
  if (!company) {
    return res.status(401).json({ error: 'Company has been deleted' });
  }
  if (!company.is_active) {
    return res.status(401).json({ error: 'Admin login is disabled for this company' });
  }
  next();
};

export const companyAdminGuard = [authenticate, companyAdminOnly, requireActiveCompany];

export const sameCompanyOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  const { company_code } = req.params;
  if (req.user?.company_code !== company_code && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied — wrong company' });
  }
  next();
};
