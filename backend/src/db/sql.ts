export const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  company_code VARCHAR(50) UNIQUE NOT NULL,
  admin_password VARCHAR(255) NOT NULL,
  admin_password_plain TEXT DEFAULT '',
  building_name VARCHAR(255) DEFAULT '',
  address TEXT DEFAULT '',
  total_floors INTEGER DEFAULT 1,
  evacuation_plan TEXT DEFAULT '',
  assembly_point VARCHAR(500) DEFAULT '',
  evacuation_plan_file VARCHAR(500) DEFAULT '',
  evacuation_plan_file_name VARCHAR(255) DEFAULT '',
  evacuation_plan_file_mime VARCHAR(100) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(50) NOT NULL REFERENCES companies(company_code) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  floor VARCHAR(50) DEFAULT '1',
  zone_type VARCHAR(50) DEFAULT 'general',
  description TEXT DEFAULT '',
  has_fire_extinguisher BOOLEAN DEFAULT false,
  has_emergency_exit BOOLEAN DEFAULT false,
  extinguisher_location TEXT DEFAULT '',
  exit_direction TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(50) NOT NULL REFERENCES companies(company_code) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  position VARCHAR(255) DEFAULT 'Worker',
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  zone_name VARCHAR(255) DEFAULT '',
  fcm_token TEXT DEFAULT '',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(company_code, phone)
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(50) NOT NULL REFERENCES companies(company_code) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL DEFAULT 'general',
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  zone_name VARCHAR(255) DEFAULT '',
  triggered_by_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  triggered_by_name VARCHAR(255) DEFAULT '',
  status VARCHAR(20) DEFAULT 'active',
  devices_notified INTEGER DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  resolved_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  company_code VARCHAR(50) NOT NULL REFERENCES companies(company_code) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  worker_name VARCHAR(255) NOT NULL,
  worker_acknowledged_at TIMESTAMPTZ,
  admin_acknowledged_at TIMESTAMPTZ,
  admin_acknowledged_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alert_id, worker_id)
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(50) NOT NULL REFERENCES companies(company_code) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workers_company ON workers(company_code);
CREATE INDEX IF NOT EXISTS idx_alerts_company ON alerts(company_code);
CREATE INDEX IF NOT EXISTS idx_zones_company ON zones(company_code);
CREATE INDEX IF NOT EXISTS idx_ack_alert ON alert_acknowledgments(alert_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_company ON emergency_contacts(company_code);
`;
