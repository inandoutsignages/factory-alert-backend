import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as store from '../db/store';
import { authenticate, createSession, AuthRequest } from '../middleware/auth';
import { evacPlanPayload } from '../utils/evacuationFiles';

const router = Router();

router.get('/join/zones', async (req: Request, res: Response) => {
  const company_code = String(req.query.company_code || '').toUpperCase();
  if (!company_code) {
    return res.status(400).json({ error: 'company_code is required' });
  }

  const company = await store.findCompanyByCode(company_code);
  if (!company || !company.is_active) {
    return res.status(404).json({ error: 'Invalid company code' });
  }

  const zones = await store.listZonesByCompany(company_code);

  return res.json({
    zones: zones.map(z => ({
      id: z.id,
      name: z.name,
      floor: z.floor,
      zone_type: z.zone_type,
    })),
    company_name: company.name,
    building_name: company.building_name,
  });
});

router.post('/join', async (req: Request, res: Response) => {
  const { company_code, phone, name, position, zone_id, fcm_token } = req.body;

  if (!company_code || !phone || !name) {
    return res.status(400).json({ error: 'company_code, phone, and name are required' });
  }
  if (!zone_id) {
    return res.status(400).json({ error: 'zone_id is required — select your work zone' });
  }

  const company = await store.findCompanyByCode(company_code);
  if (!company || !company.is_active) {
    return res.status(404).json({
      error: 'Invalid company code. Please check with your supervisor.',
    });
  }

  const zone = await store.findZoneById(company_code, zone_id);
  if (!zone) {
    return res.status(400).json({ error: 'Invalid zone. Please select a zone from the list.' });
  }

  let worker = await store.findWorkerByPhone(company_code, phone);

  if (worker) {
    worker = await store.updateWorker(worker.id, company_code, {
      fcm_token: fcm_token || worker.fcm_token,
      name,
      position: position || worker.position,
      zone_id: zone.id,
      zone_name: zone.name,
      is_active: true,
    });

    const token = createSession({
      role: 'worker',
      worker_id: worker!.id,
      company_code,
    });

    return res.json({
      message: 'Welcome back!',
      token,
      worker_id: worker!.id,
      company_name: company.name,
      building_name: company.building_name,
      zone_id: zone.id,
      zone_name: zone.name,
    });
  }

  const newWorker = await store.createWorker({
    id: uuidv4(),
    company_code,
    name,
    phone,
    position: position || 'Worker',
    zone_id: zone.id,
    zone_name: zone.name,
    fcm_token: fcm_token || '',
    is_active: true,
  });

  const token = createSession({
    role: 'worker',
    worker_id: newWorker.id,
    company_code,
  });

  return res.status(201).json({
    message: `Joined ${company.name} successfully`,
    token,
    worker_id: newWorker.id,
    company_name: company.name,
    building_name: company.building_name,
    zone_id: zone.id,
    zone_name: zone.name,
  });
});

router.patch('/fcm-token', authenticate, async (req: AuthRequest, res: Response) => {
  const { fcm_token } = req.body;
  const { worker_id, company_code } = req.user!;

  const worker = await store.updateWorker(worker_id!, company_code!, { fcm_token });
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  return res.json({ message: 'FCM token updated' });
});

router.get('/zones', authenticate, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const zones = await store.listZonesByCompany(company_code!);
  return res.json({ zones });
});

router.get('/evacuation-plan', authenticate, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.user!;
  const company = await store.findCompanyByCode(company_code!);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const emergency_contacts = await store.listEmergencyContacts(company_code!);

  return res.json({
    building_name: company.building_name,
    company_name: company.name,
    ...evacPlanPayload(company),
    emergency_contacts: emergency_contacts.map(c => ({
      id: c.id,
      label: c.label,
      phone: c.phone,
    })),
    read_only: true,
    managed_by: 'super_admin',
  });
});

router.post('/evacuation-plan', authenticate, (_req: AuthRequest, res: Response) =>
  res.status(403).json({ error: 'Evacuation plan can only be managed by Factory Alert super admin' })
);
router.patch('/evacuation-plan', authenticate, (_req: AuthRequest, res: Response) =>
  res.status(403).json({ error: 'Evacuation plan can only be managed by Factory Alert super admin' })
);
router.delete('/evacuation-plan', authenticate, (_req: AuthRequest, res: Response) =>
  res.status(403).json({ error: 'Evacuation plan can only be managed by Factory Alert super admin' })
);

router.post('/alert', authenticate, async (req: AuthRequest, res: Response) => {
  const { worker_id, company_code } = req.user!;
  const { alert_type, zone_id } = req.body;

  if (!alert_type) {
    return res.status(400).json({ error: 'alert_type is required (fire/medical/evacuation/security/general)' });
  }

  const validTypes = ['fire', 'medical', 'evacuation', 'security', 'general'];
  if (!validTypes.includes(alert_type)) {
    return res.status(400).json({ error: `alert_type must be one of: ${validTypes.join(', ')}` });
  }

  const worker = await store.findWorkerById(worker_id!);
  if (!worker || !worker.is_active) {
    return res.status(403).json({ error: 'Worker not found or inactive' });
  }

  let zone = null;
  if (zone_id) {
    zone = await store.findZoneById(company_code!, zone_id);
  }
  if (!zone && worker.zone_id) {
    zone = await store.findZoneById(company_code!, worker.zone_id);
  }

  const zoneName = zone?.name || worker.zone_name || 'Unknown Location';
  const zoneId = zone?.id || worker.zone_id || '';

  const targetWorkers = await store.listWorkersWithFcm(company_code!);

  const alert = await store.createAlert({
    id: uuidv4(),
    company_code: company_code!,
    alert_type,
    zone_id: zoneId,
    zone_name: zoneName,
    triggered_by_id: worker_id!,
    triggered_by_name: worker.name,
    status: 'active',
    devices_notified: targetWorkers.length,
  });

  const allActiveWorkers = await store.listWorkersByCompany(company_code!, true);
  await store.createAcknowledgmentsForWorkers(alert.id, company_code!, allActiveWorkers);

  let pushResult = { success: false, sent: 0, error: '' };
  try {
    pushResult = await sendAlertPush(alert, targetWorkers, zone);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Push failed';
    console.error('Push error:', message);
    pushResult.error = message;
  }

  return res.status(201).json({
    message: 'Alert triggered',
    alert_id: alert.id,
    devices_notified: targetWorkers.length,
    fcm_sent: pushResult.sent,
    nearest_exit: zone?.exit_direction || null,
    nearest_extinguisher: zone?.extinguisher_location || null,
  });
});

router.post('/alert/:alert_id/acknowledge', authenticate, async (req: AuthRequest, res: Response) => {
  const { company_code, worker_id } = req.user!;
  const alert_id = String(req.params.alert_id);

  const alert = await store.findAlert(alert_id, company_code!);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const worker = await store.findWorkerById(worker_id!, company_code!);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  const existing = await store.findAcknowledgment(alert_id, worker_id!);
  if (existing?.worker_acknowledged_at) {
    return res.json({
      message: 'Already acknowledged',
      acknowledged_at: existing.worker_acknowledged_at,
      acknowledgment: existing,
    });
  }

  const ack = await store.updateWorkerAcknowledgment(
    alert_id,
    worker_id!,
    company_code!,
    worker.name
  );

  return res.json({
    message: 'Worker acknowledgment recorded',
    acknowledged_at: ack?.worker_acknowledged_at,
    acknowledgment: ack,
  });
});

router.post('/alert/:alert_id/resolve', authenticate, async (req: AuthRequest, res: Response) => {
  const { company_code, worker_id } = req.user!;
  const { alert_id } = req.params;

  const worker = await store.findWorkerById(worker_id!);
  const alert = await store.resolveAlert(
    String(alert_id),
    company_code!,
    worker?.name || 'Worker'
  );

  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  return res.json({ message: 'Alert marked as resolved', alert });
});

router.get('/alerts', authenticate, async (req: AuthRequest, res: Response) => {
  const { company_code, worker_id } = req.user!;
  const alerts = await store.getWorkerAlertsWithAck(company_code!, worker_id!);
  return res.json({ alerts });
});

// ─── Push notification helpers ───────────────────────────────────────────────

async function sendAlertPush(
  alert: { id: string; alert_type: string; zone_name: string; triggered_by_name: string; company_code: string },
  workers: { fcm_token: string }[],
  zone: { name?: string; exit_direction?: string; extinguisher_location?: string } | null
): Promise<{ success: boolean; sent: number; error: string }> {
  const expoTokens = workers.map(w => w.fcm_token).filter((t: string) => t?.startsWith('ExponentPushToken'));
  const fcmTokens = workers.map(w => w.fcm_token).filter((t: string) => t && !t.startsWith('ExponentPushToken'));

  let sent = 0;

  if (expoTokens.length > 0) {
    const expoResult = await sendExpoPush(alert, expoTokens, zone);
    sent += expoResult.sent;
  }

  if (fcmTokens.length > 0 && process.env.FIREBASE_PROJECT_ID) {
    const fcmResult = await sendFirebaseAlert(alert, workers.filter(w => fcmTokens.includes(w.fcm_token)), zone);
    sent += fcmResult.sent;
  }

  if (expoTokens.length === 0 && fcmTokens.length === 0) {
    console.log(`[DEV] No push tokens — ${workers.length} workers will get alert via app polling`);
  }

  return { success: true, sent: sent || workers.length, error: '' };
}

async function sendExpoPush(
  alert: { id: string; alert_type: string; zone_name: string; triggered_by_name: string; company_code: string },
  tokens: string[],
  zone: { name?: string } | null
): Promise<{ sent: number }> {
  const alertEmojis: Record<string, string> = {
    fire: '🔥', medical: '🚑', evacuation: '🚨', security: '🔒', general: '⚠️',
  };
  const emoji = alertEmojis[alert.alert_type] || '⚠️';
  const title = `${emoji} ${alert.alert_type.toUpperCase()} ALERT`;
  const body = zone
    ? `${alert.triggered_by_name} at ${zone.name}`
    : `${alert.triggered_by_name} triggered an emergency alert`;

  const messages = tokens.map(to => ({
    to,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: 'factory_alerts',
    data: {
      alert_id: alert.id,
      alert_type: alert.alert_type,
      zone_name: alert.zone_name,
      triggered_by: alert.triggered_by_name,
      company_code: alert.company_code,
    },
  }));

  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
    const data = await res.json() as { data?: { status: string }[] };
    if (data.data) {
      sent += data.data.filter(r => r.status === 'ok').length;
    }
  }

  console.log(`[Expo Push] Sent to ${sent}/${tokens.length} devices`);
  return { sent };
}

async function sendFirebaseAlert(
  alert: { id: string; alert_type: string; zone_name: string; triggered_by_name: string; company_code: string },
  workers: { fcm_token: string }[],
  zone: { name?: string; exit_direction?: string; extinguisher_location?: string } | null
): Promise<{ success: boolean; sent: number; error: string }> {
  if (!process.env.FIREBASE_PROJECT_ID) {
    return { success: true, sent: 0, error: '' };
  }

  try {
    const admin = require('firebase-admin');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
    }

    const alertEmojis: Record<string, string> = {
      fire: '🔥', medical: '🚑', evacuation: '🚨', security: '🔒', general: '⚠️',
    };

    const emoji = alertEmojis[alert.alert_type] || '⚠️';
    const title = `${emoji} ${alert.alert_type.toUpperCase()} ALERT`;
    const body = zone
      ? `${alert.triggered_by_name} triggered alert at ${zone.name}. ${zone.exit_direction ? `Exit: ${zone.exit_direction}` : ''}`
      : `${alert.triggered_by_name} triggered an emergency alert.`;

    const tokens = workers.map(w => w.fcm_token).filter(Boolean);
    if (tokens.length === 0) return { success: true, sent: 0, error: '' };

    const dataPayload = {
      alert_id: String(alert.id),
      alert_type: String(alert.alert_type),
      zone_name: String(alert.zone_name || ''),
      triggered_by: String(alert.triggered_by_name || ''),
      company_code: String(alert.company_code || ''),
      nearest_exit: String(zone?.exit_direction || ''),
      extinguisher: String(zone?.extinguisher_location || ''),
    };

    let totalSent = 0;
    // Send 5 notification pulses — each rings/vibrates even when app is closed
    for (let pulse = 0; pulse < 5; pulse++) {
      if (pulse > 0) await new Promise(resolve => setTimeout(resolve, 3000));

      const message = {
        notification: { title, body },
        data: dataPayload,
        android: {
          priority: 'high' as const,
          ttl: 86400000,
          notification: {
            channelId: 'factory_alerts',
            priority: 'max' as const,
            visibility: 'public' as const,
            defaultVibrateTimings: false,
            vibrateTimingsMillis: [0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000],
            defaultSound: true,
            tag: `alert_${alert.id}_p${pulse}`,
          },
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: {
            aps: {
              alert: { title, body },
              sound: 'default',
              badge: 1,
            },
          },
        },
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      response.responses.forEach((r: { success: boolean; error?: { message: string } }, i: number) => {
        if (!r.success) console.error(`[FCM] pulse ${pulse} token ${i} failed:`, r.error?.message);
      });
      totalSent = Math.max(totalSent, response.successCount);
    }

    console.log(`[FCM] Emergency push sent (${totalSent}/${tokens.length} devices, 5 pulses)`);
    return { success: true, sent: totalSent, error: '' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'FCM error';
    return { success: false, sent: 0, error: message };
  }
}

export default router;
