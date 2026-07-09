export interface Company {
  id: string;
  name: string;
  company_code: string;
  admin_password: string;
  admin_password_plain: string;
  building_name: string;
  address: string;
  total_floors: number;
  evacuation_plan: string;
  assembly_point: string;
  evacuation_plan_file: string;
  evacuation_plan_file_name: string;
  evacuation_plan_file_mime: string;
  created_at: string;
  is_active: boolean;
}

export interface Zone {
  id: string;
  company_code: string;
  name: string;
  floor: string;
  zone_type: string;
  description: string;
  has_fire_extinguisher: boolean;
  has_emergency_exit: boolean;
  extinguisher_location: string;
  exit_direction: string;
  created_at: string;
}

export interface Worker {
  id: string;
  company_code: string;
  name: string;
  phone: string;
  position: string;
  zone_id: string;
  zone_name: string;
  fcm_token: string;
  joined_at: string;
  is_active: boolean;
}

export interface Alert {
  id: string;
  company_code: string;
  alert_type: string;
  zone_id: string;
  zone_name: string;
  worker_zone_name?: string;
  triggered_by_id: string;
  triggered_by_name: string;
  status: string;
  devices_notified: number;
  resolved_at: string | null;
  resolved_by_name: string | null;
  created_at: string;
}

export interface AlertAcknowledgment {
  id: string;
  alert_id: string;
  company_code: string;
  worker_id: string;
  worker_name: string;
  worker_acknowledged_at: string | null;
  admin_acknowledged_at: string | null;
  admin_acknowledged_by: string | null;
  created_at: string;
}

export interface EmergencyContact {
  id: string;
  company_code: string;
  label: string;
  phone: string;
  created_at: string;
}
