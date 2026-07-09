import { v4 as uuidv4 } from 'uuid';
import { getPool, hasDatabase } from './pool';
import { memory, mapCompany, mapZone, mapWorker, mapAlert, mapAck, mapContact } from './mappers';
import type {
  Alert,
  AlertAcknowledgment,
  Company,
  EmergencyContact,
  Worker,
  Zone,
} from './types';

export type { Alert, AlertAcknowledgment, Company, EmergencyContact, Worker, Zone };

// ─── Companies ───────────────────────────────────────────────────────────────

export async function findCompanyByName(name: string): Promise<Company | null> {
  if (!hasDatabase()) {
    return memory.companies.find(c => c.name.toLowerCase() === name.toLowerCase()) || null;
  }
  const { rows } = await getPool().query(
    'SELECT * FROM companies WHERE LOWER(name) = LOWER($1) LIMIT 1',
    [name]
  );
  return rows[0] ? mapCompany(rows[0]) : null;
}

export async function findCompanyByCode(code: string): Promise<Company | null> {
  if (!hasDatabase()) {
    return memory.companies.find(c => c.company_code === code) || null;
  }
  const { rows } = await getPool().query(
    'SELECT * FROM companies WHERE company_code = $1 LIMIT 1',
    [code]
  );
  return rows[0] ? mapCompany(rows[0]) : null;
}

export async function companyCodeExists(code: string): Promise<boolean> {
  if (!hasDatabase()) {
    return memory.companies.some(c => c.company_code === code);
  }
  const { rows } = await getPool().query(
    'SELECT 1 FROM companies WHERE company_code = $1 LIMIT 1',
    [code]
  );
  return rows.length > 0;
}

export async function createCompany(data: Omit<Company, 'created_at'>): Promise<Company> {
  if (!hasDatabase()) {
    const company = { ...data, created_at: new Date().toISOString() };
    memory.companies.push(company);
    return company;
  }
  const { rows } = await getPool().query(
    `INSERT INTO companies (
      id, name, company_code, admin_password, admin_password_plain, building_name, address, total_floors,
      evacuation_plan, assembly_point, evacuation_plan_file, evacuation_plan_file_name,
      evacuation_plan_file_mime, is_active
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      data.id, data.name, data.company_code, data.admin_password, data.admin_password_plain || '',
      data.building_name, data.address, data.total_floors,
      data.evacuation_plan, data.assembly_point,
      data.evacuation_plan_file, data.evacuation_plan_file_name,
      data.evacuation_plan_file_mime, data.is_active,
    ]
  );
  return mapCompany(rows[0]);
}

export async function listCompaniesSummary() {
  if (!hasDatabase()) {
    return memory.companies.map(c => ({
      id: c.id,
      name: c.name,
      company_code: c.company_code,
      building_name: c.building_name,
      address: c.address,
      total_floors: c.total_floors,
      zone_count: memory.zones.filter(z => z.company_code === c.company_code).length,
      worker_count: memory.workers.filter(w => w.company_code === c.company_code && w.is_active).length,
      has_evacuation_plan: !!(c.evacuation_plan || c.evacuation_plan_file),
      is_active: c.is_active,
      created_at: c.created_at,
    }));
  }
  const { rows } = await getPool().query(`
    SELECT c.*,
      (SELECT COUNT(*)::int FROM zones z WHERE z.company_code = c.company_code) AS zone_count,
      (SELECT COUNT(*)::int FROM workers w WHERE w.company_code = c.company_code AND w.is_active) AS worker_count
    FROM companies c ORDER BY c.created_at DESC
  `);
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    company_code: String(r.company_code),
    building_name: String(r.building_name || ''),
    address: String(r.address || ''),
    total_floors: Number(r.total_floors || 1),
    zone_count: Number(r.zone_count || 0),
    worker_count: Number(r.worker_count || 0),
    has_evacuation_plan: !!(r.evacuation_plan || r.evacuation_plan_file),
    is_active: r.is_active !== false,
    created_at: mapCompany(r).created_at,
  }));
}

export async function updateCompany(
  company_code: string,
  fields: Partial<Pick<Company,
    'building_name' | 'address' | 'total_floors' | 'evacuation_plan' | 'assembly_point' |
    'evacuation_plan_file' | 'evacuation_plan_file_name' | 'evacuation_plan_file_mime' | 'is_active'
  >>
): Promise<Company | null> {
  if (!hasDatabase()) {
    const company = memory.companies.find(c => c.company_code === company_code);
    if (!company) return null;
    Object.assign(company, fields);
    return company;
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(val);
    }
  }
  if (sets.length === 0) return findCompanyByCode(company_code);
  vals.push(company_code);
  const { rows } = await getPool().query(
    `UPDATE companies SET ${sets.join(', ')} WHERE company_code = $${i} RETURNING *`,
    vals
  );
  return rows[0] ? mapCompany(rows[0]) : null;
}

export async function deactivateCompany(company_code: string): Promise<Company | null> {
  return updateCompany(company_code, { is_active: false });
}

export async function activateCompany(company_code: string): Promise<Company | null> {
  return updateCompany(company_code, { is_active: true });
}

export async function setCompanyActive(company_code: string, is_active: boolean): Promise<Company | null> {
  return updateCompany(company_code, { is_active });
}

export async function updateCompanyAdminPassword(
  company_code: string,
  hashedPassword: string,
  plainPassword: string
): Promise<Company | null> {
  if (!hasDatabase()) {
    const company = memory.companies.find(c => c.company_code === company_code);
    if (!company) return null;
    company.admin_password = hashedPassword;
    company.admin_password_plain = plainPassword;
    return company;
  }
  const { rows } = await getPool().query(
    `UPDATE companies SET admin_password = $1, admin_password_plain = $2 WHERE company_code = $3 RETURNING *`,
    [hashedPassword, plainPassword, company_code]
  );
  return rows[0] ? mapCompany(rows[0]) : null;
}

export async function deleteCompany(company_code: string): Promise<Company | null> {
  if (!hasDatabase()) {
    const index = memory.companies.findIndex(c => c.company_code === company_code);
    if (index === -1) return null;
    const [removed] = memory.companies.splice(index, 1);
    memory.zones = memory.zones.filter(z => z.company_code !== company_code);
    memory.workers = memory.workers.filter(w => w.company_code !== company_code);
    memory.alerts = memory.alerts.filter(a => a.company_code !== company_code);
    memory.alert_acknowledgments = memory.alert_acknowledgments.filter(
      a => a.company_code !== company_code
    );
    memory.emergency_contacts = memory.emergency_contacts.filter(
      c => c.company_code !== company_code
    );
    return removed;
  }
  const company = await findCompanyByCode(company_code);
  if (!company) return null;
  await getPool().query('DELETE FROM companies WHERE company_code = $1', [company_code]);
  return company;
}

// ─── Zones ───────────────────────────────────────────────────────────────────

export async function listZonesByCompany(company_code: string): Promise<Zone[]> {
  if (!hasDatabase()) {
    return memory.zones.filter(z => z.company_code === company_code);
  }
  const { rows } = await getPool().query(
    'SELECT * FROM zones WHERE company_code = $1 ORDER BY name',
    [company_code]
  );
  return rows.map(mapZone);
}

export async function findZoneById(company_code: string, zone_id: string): Promise<Zone | null> {
  if (!hasDatabase()) {
    return memory.zones.find(z => z.id === zone_id && z.company_code === company_code) || null;
  }
  const { rows } = await getPool().query(
    'SELECT * FROM zones WHERE id = $1 AND company_code = $2 LIMIT 1',
    [zone_id, company_code]
  );
  return rows[0] ? mapZone(rows[0]) : null;
}

export async function createZone(data: Omit<Zone, 'created_at'>): Promise<Zone> {
  if (!hasDatabase()) {
    const zone = { ...data, created_at: new Date().toISOString() };
    memory.zones.push(zone);
    return zone;
  }
  const { rows } = await getPool().query(
    `INSERT INTO zones (
      id, company_code, name, floor, zone_type, description,
      has_fire_extinguisher, has_emergency_exit, extinguisher_location, exit_direction
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      data.id, data.company_code, data.name, data.floor, data.zone_type, data.description,
      data.has_fire_extinguisher, data.has_emergency_exit,
      data.extinguisher_location, data.exit_direction,
    ]
  );
  return mapZone(rows[0]);
}

export async function deleteZone(company_code: string, zone_id: string): Promise<boolean> {
  if (!hasDatabase()) {
    const index = memory.zones.findIndex(z => z.id === zone_id && z.company_code === company_code);
    if (index === -1) return false;
    memory.zones.splice(index, 1);
    return true;
  }
  const { rowCount } = await getPool().query(
    'DELETE FROM zones WHERE id = $1 AND company_code = $2',
    [zone_id, company_code]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Workers ─────────────────────────────────────────────────────────────────

export async function findWorkerByPhone(company_code: string, phone: string): Promise<Worker | null> {
  if (!hasDatabase()) {
    return memory.workers.find(w => w.company_code === company_code && w.phone === phone) || null;
  }
  const { rows } = await getPool().query(
    'SELECT * FROM workers WHERE company_code = $1 AND phone = $2 LIMIT 1',
    [company_code, phone]
  );
  return rows[0] ? mapWorker(rows[0]) : null;
}

export async function findWorkerById(worker_id: string, company_code?: string): Promise<Worker | null> {
  if (!hasDatabase()) {
    return memory.workers.find(w =>
      w.id === worker_id && (!company_code || w.company_code === company_code)
    ) || null;
  }
  const query = company_code
    ? 'SELECT * FROM workers WHERE id = $1 AND company_code = $2 LIMIT 1'
    : 'SELECT * FROM workers WHERE id = $1 LIMIT 1';
  const params = company_code ? [worker_id, company_code] : [worker_id];
  const { rows } = await getPool().query(query, params);
  return rows[0] ? mapWorker(rows[0]) : null;
}

export async function createWorker(data: Omit<Worker, 'joined_at'>): Promise<Worker> {
  if (!hasDatabase()) {
    const worker = { ...data, joined_at: new Date().toISOString() };
    memory.workers.push(worker);
    return worker;
  }
  const { rows } = await getPool().query(
    `INSERT INTO workers (
      id, company_code, name, phone, position, zone_id, zone_name, fcm_token, is_active
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.id, data.company_code, data.name, data.phone, data.position,
      data.zone_id || null, data.zone_name, data.fcm_token, data.is_active,
    ]
  );
  return mapWorker(rows[0]);
}

export async function updateWorker(
  worker_id: string,
  company_code: string,
  fields: Partial<Pick<Worker, 'name' | 'position' | 'zone_id' | 'zone_name' | 'fcm_token' | 'is_active'>>
): Promise<Worker | null> {
  if (!hasDatabase()) {
    const worker = memory.workers.find(w => w.id === worker_id && w.company_code === company_code);
    if (!worker) return null;
    Object.assign(worker, fields);
    return worker;
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(key === 'zone_id' && !val ? null : val);
    }
  }
  if (sets.length === 0) return findWorkerById(worker_id, company_code);
  vals.push(worker_id, company_code);
  const { rows } = await getPool().query(
    `UPDATE workers SET ${sets.join(', ')} WHERE id = $${i} AND company_code = $${i + 1} RETURNING *`,
    vals
  );
  return rows[0] ? mapWorker(rows[0]) : null;
}

export async function listWorkersByCompany(company_code: string, activeOnly = false): Promise<Worker[]> {
  if (!hasDatabase()) {
    return memory.workers.filter(w =>
      w.company_code === company_code && (!activeOnly || w.is_active)
    );
  }
  const query = activeOnly
    ? 'SELECT * FROM workers WHERE company_code = $1 AND is_active = true ORDER BY name'
    : 'SELECT * FROM workers WHERE company_code = $1 ORDER BY name';
  const { rows } = await getPool().query(query, [company_code]);
  return rows.map(mapWorker);
}

export async function listWorkersWithFcm(company_code: string): Promise<Worker[]> {
  if (!hasDatabase()) {
    return memory.workers.filter(
      w => w.company_code === company_code && w.is_active && w.fcm_token
    );
  }
  const { rows } = await getPool().query(
    `SELECT * FROM workers WHERE company_code = $1 AND is_active = true AND fcm_token IS NOT NULL AND fcm_token != ''`,
    [company_code]
  );
  return rows.map(mapWorker);
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export async function createAlert(data: Omit<Alert, 'created_at' | 'resolved_at' | 'resolved_by_name'>): Promise<Alert> {
  if (!hasDatabase()) {
    const alert: Alert = {
      ...data,
      resolved_at: null,
      resolved_by_name: null,
      created_at: new Date().toISOString(),
    };
    memory.alerts.push(alert);
    return alert;
  }
  const { rows } = await getPool().query(
    `INSERT INTO alerts (
      id, company_code, alert_type, zone_id, zone_name,
      triggered_by_id, triggered_by_name, status, devices_notified
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.id, data.company_code, data.alert_type,
      data.zone_id || null, data.zone_name,
      data.triggered_by_id || null, data.triggered_by_name,
      data.status, data.devices_notified,
    ]
  );
  return mapAlert(rows[0]);
}

export async function findAlert(alert_id: string, company_code: string): Promise<Alert | null> {
  if (!hasDatabase()) {
    return memory.alerts.find(a => a.id === alert_id && a.company_code === company_code) || null;
  }
  const { rows } = await getPool().query(
    'SELECT * FROM alerts WHERE id = $1 AND company_code = $2 LIMIT 1',
    [alert_id, company_code]
  );
  return rows[0] ? mapAlert(rows[0]) : null;
}

export async function listAlertsByCompany(company_code: string, limit?: number): Promise<Alert[]> {
  if (!hasDatabase()) {
    const alerts = memory.alerts.filter(a => a.company_code === company_code);
    const sorted = [...alerts].reverse();
    return limit ? sorted.slice(0, limit) : sorted;
  }
  const query = limit
    ? 'SELECT * FROM alerts WHERE company_code = $1 ORDER BY created_at DESC LIMIT $2'
    : 'SELECT * FROM alerts WHERE company_code = $1 ORDER BY created_at DESC';
  const { rows } = await getPool().query(query, limit ? [company_code, limit] : [company_code]);
  return rows.map(mapAlert);
}

export async function resolveAlert(
  alert_id: string,
  company_code: string,
  resolved_by_name: string
): Promise<Alert | null> {
  if (!hasDatabase()) {
    const alert = memory.alerts.find(a => a.id === alert_id && a.company_code === company_code);
    if (!alert) return null;
    alert.status = 'resolved';
    alert.resolved_at = new Date().toISOString();
    alert.resolved_by_name = resolved_by_name;
    return alert;
  }
  const { rows } = await getPool().query(
    `UPDATE alerts SET status = 'resolved', resolved_at = NOW(), resolved_by_name = $1
     WHERE id = $2 AND company_code = $3 RETURNING *`,
    [resolved_by_name, alert_id, company_code]
  );
  return rows[0] ? mapAlert(rows[0]) : null;
}

// ─── Acknowledgments ─────────────────────────────────────────────────────────

export async function createAcknowledgment(
  data: Omit<AlertAcknowledgment, 'created_at'>
): Promise<AlertAcknowledgment> {
  if (!hasDatabase()) {
    const ack = { ...data, created_at: new Date().toISOString() };
    memory.alert_acknowledgments.push(ack);
    return ack;
  }
  const { rows } = await getPool().query(
    `INSERT INTO alert_acknowledgments (
      id, alert_id, company_code, worker_id, worker_name,
      worker_acknowledged_at, admin_acknowledged_at, admin_acknowledged_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.id, data.alert_id, data.company_code, data.worker_id, data.worker_name,
      data.worker_acknowledged_at, data.admin_acknowledged_at, data.admin_acknowledged_by,
    ]
  );
  return mapAck(rows[0]);
}

export async function createAcknowledgmentsForWorkers(
  alert_id: string,
  company_code: string,
  workers: Worker[]
): Promise<void> {
  for (const w of workers) {
    await createAcknowledgment({
      id: uuidv4(),
      alert_id,
      company_code,
      worker_id: w.id,
      worker_name: w.name,
      worker_acknowledged_at: null,
      admin_acknowledged_at: null,
      admin_acknowledged_by: null,
    });
  }
}

export async function findAcknowledgment(
  alert_id: string,
  worker_id: string
): Promise<AlertAcknowledgment | null> {
  if (!hasDatabase()) {
    return memory.alert_acknowledgments.find(
      a => a.alert_id === alert_id && a.worker_id === worker_id
    ) || null;
  }
  const { rows } = await getPool().query(
    'SELECT * FROM alert_acknowledgments WHERE alert_id = $1 AND worker_id = $2 LIMIT 1',
    [alert_id, worker_id]
  );
  return rows[0] ? mapAck(rows[0]) : null;
}

export async function listAcknowledgmentsByAlert(
  alert_id: string,
  company_code: string
): Promise<AlertAcknowledgment[]> {
  if (!hasDatabase()) {
    return memory.alert_acknowledgments.filter(
      a => a.alert_id === alert_id && a.company_code === company_code
    );
  }
  const { rows } = await getPool().query(
    'SELECT * FROM alert_acknowledgments WHERE alert_id = $1 AND company_code = $2',
    [alert_id, company_code]
  );
  return rows.map(mapAck);
}

export async function updateWorkerAcknowledgment(
  alert_id: string,
  worker_id: string,
  company_code: string,
  worker_name: string
): Promise<AlertAcknowledgment | null> {
  if (!hasDatabase()) {
    let ack = memory.alert_acknowledgments.find(
      a => a.alert_id === alert_id && a.worker_id === worker_id
    );
    if (!ack) {
      ack = {
        id: uuidv4(),
        alert_id,
        company_code,
        worker_id,
        worker_name,
        worker_acknowledged_at: null,
        admin_acknowledged_at: null,
        admin_acknowledged_by: null,
        created_at: new Date().toISOString(),
      };
      memory.alert_acknowledgments.push(ack);
    }
    ack.worker_acknowledged_at = new Date().toISOString();
    ack.worker_name = worker_name;
    return ack;
  }
  const { rows } = await getPool().query(
    `INSERT INTO alert_acknowledgments (
      id, alert_id, company_code, worker_id, worker_name, worker_acknowledged_at
    ) VALUES ($1,$2,$3,$4,$5,NOW())
    ON CONFLICT (alert_id, worker_id) DO UPDATE SET
      worker_acknowledged_at = NOW(), worker_name = EXCLUDED.worker_name
    RETURNING *`,
    [uuidv4(), alert_id, company_code, worker_id, worker_name]
  );
  return rows[0] ? mapAck(rows[0]) : null;
}

export async function updateAdminAcknowledgment(
  alert_id: string,
  worker_id: string,
  company_code: string,
  worker_name: string,
  admin_name: string
): Promise<AlertAcknowledgment | null> {
  if (!hasDatabase()) {
    let ack = memory.alert_acknowledgments.find(
      a => a.alert_id === alert_id && a.worker_id === worker_id
    );
    if (!ack) {
      ack = {
        id: uuidv4(),
        alert_id,
        company_code,
        worker_id,
        worker_name,
        worker_acknowledged_at: null,
        admin_acknowledged_at: null,
        admin_acknowledged_by: null,
        created_at: new Date().toISOString(),
      };
      memory.alert_acknowledgments.push(ack);
    }
    ack.admin_acknowledged_at = new Date().toISOString();
    ack.admin_acknowledged_by = admin_name;
    return ack;
  }
  const { rows } = await getPool().query(
    `UPDATE alert_acknowledgments SET
      admin_acknowledged_at = NOW(), admin_acknowledged_by = $1
     WHERE alert_id = $2 AND worker_id = $3 AND company_code = $4 RETURNING *`,
    [admin_name, alert_id, worker_id, company_code]
  );
  return rows[0] ? mapAck(rows[0]) : null;
}

// ─── Emergency contacts ──────────────────────────────────────────────────────

export async function listEmergencyContacts(company_code: string): Promise<EmergencyContact[]> {
  if (!hasDatabase()) {
    return memory.emergency_contacts
      .filter(c => c.company_code === company_code)
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  const { rows } = await getPool().query(
    'SELECT * FROM emergency_contacts WHERE company_code = $1 ORDER BY label',
    [company_code]
  );
  return rows.map(mapContact);
}

export async function createEmergencyContact(
  data: Omit<EmergencyContact, 'created_at'>
): Promise<EmergencyContact> {
  if (!hasDatabase()) {
    const contact = { ...data, created_at: new Date().toISOString() };
    memory.emergency_contacts.push(contact);
    return contact;
  }
  const { rows } = await getPool().query(
    'INSERT INTO emergency_contacts (id, company_code, label, phone) VALUES ($1,$2,$3,$4) RETURNING *',
    [data.id, data.company_code, data.label, data.phone]
  );
  return mapContact(rows[0]);
}

export async function findEmergencyContact(
  contact_id: string,
  company_code: string
): Promise<EmergencyContact | null> {
  if (!hasDatabase()) {
    return memory.emergency_contacts.find(
      c => c.id === contact_id && c.company_code === company_code
    ) || null;
  }
  const { rows } = await getPool().query(
    'SELECT * FROM emergency_contacts WHERE id = $1 AND company_code = $2 LIMIT 1',
    [contact_id, company_code]
  );
  return rows[0] ? mapContact(rows[0]) : null;
}

export async function updateEmergencyContact(
  contact_id: string,
  company_code: string,
  fields: Partial<Pick<EmergencyContact, 'label' | 'phone'>>
): Promise<EmergencyContact | null> {
  if (!hasDatabase()) {
    const contact = memory.emergency_contacts.find(
      c => c.id === contact_id && c.company_code === company_code
    );
    if (!contact) return null;
    Object.assign(contact, fields);
    return contact;
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = $${i++}`);
      vals.push(val);
    }
  }
  if (sets.length === 0) return findEmergencyContact(contact_id, company_code);
  vals.push(contact_id, company_code);
  const { rows } = await getPool().query(
    `UPDATE emergency_contacts SET ${sets.join(', ')} WHERE id = $${i} AND company_code = $${i + 1} RETURNING *`,
    vals
  );
  return rows[0] ? mapContact(rows[0]) : null;
}

export async function deleteEmergencyContact(
  contact_id: string,
  company_code: string
): Promise<EmergencyContact | null> {
  if (!hasDatabase()) {
    const index = memory.emergency_contacts.findIndex(
      c => c.id === contact_id && c.company_code === company_code
    );
    if (index === -1) return null;
    const [removed] = memory.emergency_contacts.splice(index, 1);
    return removed;
  }
  const { rows } = await getPool().query(
    'DELETE FROM emergency_contacts WHERE id = $1 AND company_code = $2 RETURNING *',
    [contact_id, company_code]
  );
  return rows[0] ? mapContact(rows[0]) : null;
}

// Dashboard helpers
export async function getCompanyStats(company_code: string) {
  const workers = await listWorkersByCompany(company_code, true);
  const zones = await listZonesByCompany(company_code);
  const alerts = await listAlertsByCompany(company_code);
  const activeAlerts = alerts.filter(a => a.status === 'active');
  return {
    total_workers: workers.length,
    total_zones: zones.length,
    total_alerts: alerts.length,
    active_alerts: activeAlerts.length,
    workers,
    zones,
    activeAlerts,
    recentAlerts: alerts.slice(0, 20),
  };
}

export async function getAlertWithAckSummary(alert: Alert) {
  const acks = await listAcknowledgmentsByAlert(alert.id, alert.company_code);
  const workerAcked = acks.filter(x => x.worker_acknowledged_at).length;
  const adminAcked = acks.filter(x => x.admin_acknowledged_at).length;
  return {
    ...alert,
    acknowledgment_summary: {
      total_workers: acks.length,
      worker_acknowledged: workerAcked,
      admin_acknowledged: adminAcked,
      pending_worker: acks.length - workerAcked,
      pending_admin: workerAcked - adminAcked,
    },
  };
}

export async function getWorkerAlertsWithAck(
  company_code: string,
  worker_id: string,
  limit = 20
): Promise<(Alert & { worker_acknowledged: boolean; worker_acknowledged_at: string | null })[]> {
  const alerts = await listAlertsByCompany(company_code, limit);
  const result = [];
  for (const a of alerts) {
    const ack = await findAcknowledgment(a.id, worker_id);
    result.push({
      ...a,
      worker_acknowledged: !!ack?.worker_acknowledged_at,
      worker_acknowledged_at: ack?.worker_acknowledged_at || null,
    });
  }
  return result;
}
