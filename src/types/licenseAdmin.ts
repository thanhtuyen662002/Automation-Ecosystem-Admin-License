export type Plan = 'trial' | 'standard' | 'pro' | 'agency' | 'lifetime';
export type LicenseStatus = 'active' | 'suspended' | 'revoked' | 'expired';

export interface LicenseMetadata {
  customer_email?: string;
  customer_name?: string;
  source?: string;
  payment_provider?: string;
  payment_id?: string | null;
  notes?: string;
  [key: string]: any;
}

export interface License {
  id: string;
  license_key_prefix: string;
  label: string | null;
  plan: Plan;
  status: LicenseStatus;
  max_devices: number;
  active_devices_count?: number;
  expires_at: string | null;
  activated_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  metadata: LicenseMetadata;
  created_at: string;
  updated_at: string;
}

export interface LicenseDevice {
  id: string;
  license_id: string;
  device_name: string | null;
  platform: string | null;
  app_version: string | null;
  status: 'active' | 'revoked';
  activated_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface AuditLog {
  id: string;
  license_id: string | null;
  device_id: string | null;
  event_type: string;
  severity: 'info' | 'warning' | 'error';
  detail: any;
  created_at: string;
}

export interface CreateLicenseParams {
  label?: string;
  plan: Plan;
  max_devices: number;
  expires_at: string | null;
  metadata: LicenseMetadata;
}
