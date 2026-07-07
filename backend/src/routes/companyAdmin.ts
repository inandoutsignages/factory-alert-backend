import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as store from '../db/store';
import { companyAdminGuard, createSession, AuthRequest } from '../middleware/auth';
import { evacPlanPayload } from '../utils/evacuationFiles';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { company_code, password } = req.body;

  if (!company_code || !password) {
    return res.status(400).json({ error: 'company_code and password are required' });
  }

  const company = await store.findCompanyByCode(company_code);
  if (!company) {
    return res.status(401).json({ error: 'Invalid company code or company has been deleted' });
  }
  if (!company.is_active) {
    return res.status(401).json({ error: 'Admin login is disabled for this company. Contact super admin to re-enable access.' });
  }

  const passwordMatch = await bcrypt.compare(password, company.admin_password);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = createSession({
    role: 'company_admin',
    company_code,
    company_name: company.name,
  });

  return res.json({
    token,
    company_code,
    company_name: company.name,
    building_name: company.building_name,
  });
});

router.get('/dashboard', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const company = await store.findCompanyByCode(company_code!);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const stats = await store.getCompanyStats(company_code!);

  return res.json({
    company: {
      name: company.name,
      building_name: company.building_name,
      address: company.address,
      total_floors: company.total_floors,
      ...evacPlanPayload(company),
    },
    stats: {
      total_workers: stats.total_workers,
      total_zones: stats.total_zones,
      total_alerts: stats.total_alerts,
      active_alerts: stats.active_alerts,
    },
    active_alerts: stats.activeAlerts,
    recent_alerts: stats.recentAlerts,
    workers: stats.workers,
    zones: stats.zones,
  });
});

router.get('/evacuation-plan', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const company = await store.findCompanyByCode(company_code!);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  return res.json({
    building_name: company.building_name,
    company_name: company.name,
    ...evacPlanPayload(company),
    read_only: true,
    managed_by: 'super_admin',
    note: 'Evacuation plan can only be uploaded, edited, or deleted by Factory Alert super admin',
  });
});

const evacuationPlanForbidden = (_req: AuthRequest, res: Response) =>
  res.status(403).json({
    error: 'Evacuation plan can only be uploaded, edited, or deleted by Factory Alert super admin',
  });

router.post('/evacuation-plan', ...companyAdminGuard, evacuationPlanForbidden);
router.patch('/evacuation-plan', ...companyAdminGuard, evacuationPlanForbidden);
router.put('/evacuation-plan', ...companyAdminGuard, evacuationPlanForbidden);
router.delete('/evacuation-plan', ...companyAdminGuard, evacuationPlanForbidden);

router.get('/emergency-contacts', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const contacts = await store.listEmergencyContacts(company_code!);
  return res.json({ contacts, total: contacts.length });
});

router.post('/emergency-contacts', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const { label, phone } = req.body;

  if (!label?.trim()) return res.status(400).json({ error: 'Label is required (e.g. Security, Fire Dept)' });
  if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });

  const contact = await store.createEmergencyContact({
    id: uuidv4(),
    company_code: company_code!,
    label: label.trim(),
    phone: phone.trim(),
  });

  return res.status(201).json({ message: 'Emergency contact added', contact });
});

router.patch('/emergency-contacts/:contact_id', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const contact_id = String(req.params.contact_id);
  const { label, phone } = req.body;

  if (label !== undefined && !String(label).trim()) {
    return res.status(400).json({ error: 'Label cannot be empty' });
  }
  if (phone !== undefined && !String(phone).trim()) {
    return res.status(400).json({ error: 'Phone cannot be empty' });
  }

  const contact = await store.updateEmergencyContact(contact_id, company_code!, {
    ...(label !== undefined && { label: String(label).trim() }),
    ...(phone !== undefined && { phone: String(phone).trim() }),
  });

  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  return res.json({ message: 'Emergency contact updated', contact });
});

router.delete('/emergency-contacts/:contact_id', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const contact_id = String(req.params.contact_id);

  const removed = await store.deleteEmergencyContact(contact_id, company_code!);
  if (!removed) return res.status(404).json({ error: 'Contact not found' });

  return res.json({ message: `Removed ${removed.label}`, contact: removed });
});

router.get('/workers', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const workers = await store.listWorkersByCompany(company_code!);

  return res.json({
    workers: workers.map(w => ({
      id: w.id,
      name: w.name,
      phone: w.phone,
      position: w.position,
      zone_id: w.zone_id || '',
      zone_name: w.zone_name || 'Not set',
      is_active: w.is_active,
      joined_at: w.joined_at,
      has_fcm: !!w.fcm_token,
    })),
    total: workers.length,
  });
});

router.delete('/workers/:worker_id', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const { worker_id } = req.params;

  const worker = await store.updateWorker(String(worker_id), company_code!, { is_active: false });
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  return res.json({ message: `Worker ${worker.name} deactivated` });
});

router.get('/alerts', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const alerts = await store.listAlertsByCompany(company_code!);
  const withSummary = await Promise.all(alerts.map(a => store.getAlertWithAckSummary(a)));

  return res.json({ alerts: withSummary, total: withSummary.length });
});

router.get('/alerts/:alert_id/acknowledgments', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const { alert_id } = req.params;

  const alert = await store.findAlert(String(alert_id), company_code!);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const acks = await store.listAcknowledgmentsByAlert(String(alert_id), company_code!);
  const mapped = acks.map(a => ({
    id: a.id,
    worker_id: a.worker_id,
    worker_name: a.worker_name,
    worker_acknowledged: !!a.worker_acknowledged_at,
    worker_acknowledged_at: a.worker_acknowledged_at,
    admin_acknowledged: !!a.admin_acknowledged_at,
    admin_acknowledged_at: a.admin_acknowledged_at,
    admin_acknowledged_by: a.admin_acknowledged_by,
  }));

  const activeWorkers = await store.listWorkersByCompany(company_code!, true);
  for (const w of activeWorkers) {
    if (!mapped.find(a => a.worker_id === w.id)) {
      mapped.push({
        id: '',
        worker_id: w.id,
        worker_name: w.name,
        worker_acknowledged: false,
        worker_acknowledged_at: null,
        admin_acknowledged: false,
        admin_acknowledged_at: null,
        admin_acknowledged_by: null,
      });
    }
  }

  mapped.sort((a, b) => a.worker_name.localeCompare(b.worker_name));

  return res.json({
    alert: {
      id: alert.id,
      alert_type: alert.alert_type,
      zone_name: alert.zone_name,
      triggered_by_name: alert.triggered_by_name,
      status: alert.status,
      created_at: alert.created_at,
    },
    acknowledgments: mapped,
    summary: {
      total: mapped.length,
      worker_acknowledged: mapped.filter(a => a.worker_acknowledged).length,
      admin_acknowledged: mapped.filter(a => a.admin_acknowledged).length,
    },
  });
});

router.post('/alerts/:alert_id/acknowledge/:worker_id', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const alert_id = String(req.params.alert_id);
  const worker_id = String(req.params.worker_id);
  const { acknowledged_by_name } = req.body;

  const alert = await store.findAlert(alert_id, company_code!);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const worker = await store.findWorkerById(worker_id, company_code!);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  let ack = await store.findAcknowledgment(alert_id, worker_id);

  if (!ack) {
    ack = await store.createAcknowledgment({
      id: uuidv4(),
      alert_id,
      company_code: company_code!,
      worker_id,
      worker_name: worker.name,
      worker_acknowledged_at: null,
      admin_acknowledged_at: null,
      admin_acknowledged_by: null,
    });
  }

  if (!ack.worker_acknowledged_at) {
    return res.status(400).json({
      error: 'Worker has not acknowledged yet. They must press Acknowledge 3 times on the mobile app after exiting.',
    });
  }

  if (ack.admin_acknowledged_at) {
    return res.json({ message: 'Already acknowledged by admin', acknowledgment: ack });
  }

  const updated = await store.updateAdminAcknowledgment(
    alert_id,
    worker_id,
    company_code!,
    worker.name,
    acknowledged_by_name || 'Company Admin'
  );

  return res.json({
    message: `Admin acknowledgment recorded for ${worker.name}`,
    acknowledgment: updated,
  });
});

router.patch('/alerts/:alert_id/resolve', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const { alert_id } = req.params;
  const { resolved_by_name } = req.body;

  const alert = await store.resolveAlert(String(alert_id), company_code!, resolved_by_name || 'Admin');
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  return res.json({ message: 'Alert resolved', alert });
});

router.get('/zones', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const zones = await store.listZonesByCompany(company_code!);
  return res.json({ zones, total: zones.length });
});

router.post('/zones', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const {
    name, floor, zone_type, description,
    has_fire_extinguisher, has_emergency_exit,
    extinguisher_location, exit_direction,
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Zone name is required' });

  const zone = await store.createZone({
    id: uuidv4(),
    company_code: company_code!,
    name,
    floor: floor || '1',
    zone_type: zone_type || 'general',
    description: description || '',
    has_fire_extinguisher: has_fire_extinguisher || false,
    has_emergency_exit: has_emergency_exit || false,
    extinguisher_location: extinguisher_location || '',
    exit_direction: exit_direction || '',
  });

  return res.status(201).json({ message: 'Zone created', zone });
});

router.delete('/zones/:zone_id', ...companyAdminGuard, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const { zone_id } = req.params;

  const deleted = await store.deleteZone(company_code!, String(zone_id));
  if (!deleted) return res.status(404).json({ error: 'Zone not found' });

  return res.json({ message: 'Zone deleted' });
});

export default router;
