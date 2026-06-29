import {
  Alert,
  AlertAcknowledgment,
  Company,
  EmergencyContact,
  Worker,
  Zone,
} from './types';

export const memory = {
  companies: [] as Company[],
  zones: [] as Zone[],
  workers: [] as Worker[],
  alerts: [] as Alert[],
  alert_acknowledgments: [] as AlertAcknowledgment[],
  emergency_contacts: [] as EmergencyContact[],
};

function iso(d: string | Date | null | undefined): string {
  if (!d) return new Date().toISOString();
  return d instanceof Date ? d.toISOString() : String(d);
}

function isoOrNull(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

export function mapCompany(r: Record<string, unknown>): Company {
  return {
    id: String(r.id),
    name: String(r.name),
    company_code: String(r.company_code),
    admin_password: String(r.admin_password),
    building_name: String(r.building_name || ''),
    address: String(r.address || ''),
    total_floors: Number(r.total_floors || 1),
    evacuation_plan: String(r.evacuation_plan || ''),
    assembly_point: String(r.assembly_point || ''),
    evacuation_plan_file: String(r.evacuation_plan_file || ''),
    evacuation_plan_file_name: String(r.evacuation_plan_file_name || ''),
    evacuation_plan_file_mime: String(r.evacuation_plan_file_mime || ''),
    created_at: iso(r.created_at as string),
    is_active: r.is_active !== false,
  };
}

export function mapZone(r: Record<string, unknown>): Zone {
  return {
    id: String(r.id),
    company_code: String(r.company_code),
    name: String(r.name),
    floor: String(r.floor || '1'),
    zone_type: String(r.zone_type || 'general'),
    description: String(r.description || ''),
    has_fire_extinguisher: !!r.has_fire_extinguisher,
    has_emergency_exit: !!r.has_emergency_exit,
    extinguisher_location: String(r.extinguisher_location || ''),
    exit_direction: String(r.exit_direction || ''),
    created_at: iso(r.created_at as string),
  };
}

export function mapWorker(r: Record<string, unknown>): Worker {
  return {
    id: String(r.id),
    company_code: String(r.company_code),
    name: String(r.name),
    phone: String(r.phone),
    position: String(r.position || 'Worker'),
    zone_id: String(r.zone_id || ''),
    zone_name: String(r.zone_name || ''),
    fcm_token: String(r.fcm_token || ''),
    joined_at: iso(r.joined_at as string),
    is_active: r.is_active !== false,
  };
}

export function mapAlert(r: Record<string, unknown>): Alert {
  return {
    id: String(r.id),
    company_code: String(r.company_code),
    alert_type: String(r.alert_type),
    zone_id: String(r.zone_id || ''),
    zone_name: String(r.zone_name || ''),
    triggered_by_id: String(r.triggered_by_id || ''),
    triggered_by_name: String(r.triggered_by_name || ''),
    status: String(r.status || 'active'),
    devices_notified: Number(r.devices_notified || 0),
    resolved_at: isoOrNull(r.resolved_at as string),
    resolved_by_name: r.resolved_by_name ? String(r.resolved_by_name) : null,
    created_at: iso(r.created_at as string),
  };
}

export function mapAck(r: Record<string, unknown>): AlertAcknowledgment {
  return {
    id: String(r.id),
    alert_id: String(r.alert_id),
    company_code: String(r.company_code),
    worker_id: String(r.worker_id),
    worker_name: String(r.worker_name),
    worker_acknowledged_at: isoOrNull(r.worker_acknowledged_at as string),
    admin_acknowledged_at: isoOrNull(r.admin_acknowledged_at as string),
    admin_acknowledged_by: r.admin_acknowledged_by ? String(r.admin_acknowledged_by) : null,
    created_at: iso(r.created_at as string),
  };
}

export function mapContact(r: Record<string, unknown>): EmergencyContact {
  return {
    id: String(r.id),
    company_code: String(r.company_code),
    label: String(r.label),
    phone: String(r.phone),
    created_at: iso(r.created_at as string),
  };
}
