import { CreateLicenseParams } from '../types/licenseAdmin';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function getAdminFunctionUrl(): string {
  const customUrl = import.meta.env.VITE_LICENSE_ADMIN_FUNCTION_URL;
  if (customUrl) return customUrl;
  return `${supabaseUrl}/functions/v1/license-admin`;
}

export function getAdminSecret(): string | null {
  return sessionStorage.getItem('license_admin_secret');
}

export function setAdminSecret(secret: string) {
  sessionStorage.setItem('license_admin_secret', secret);
}

export function removeAdminSecret() {
  sessionStorage.removeItem('license_admin_secret');
}

async function fetchAdmin(action: string, payload: any = {}) {
  const adminSecret = getAdminSecret();
  if (!adminSecret) {
    throw new Error('missing_secret');
  }

  const url = getAdminFunctionUrl();
  let res;
  
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecret
      },
      body: JSON.stringify({ action, ...payload })
    });
  } catch (err: any) {
    console.error("fetchAdmin Network Error:", err);
    throw new Error(`Lỗi kết nối mạng đến ${url}. Vui lòng kiểm tra Supabase URL, Function URL, hoặc backend có bị chặn CORS không. Chi tiết: ${err.message}`);
  }

  if (res.status === 401) {
    throw new Error('unauthorized');
  } else if (res.status === 403) {
    throw new Error('forbidden');
  }

  if (!res.ok) {
    let msg = 'network_error';
    try {
      const text = await res.text();
      const d = JSON.parse(text);
      msg = d.message || d.error || `HTTP ${res.status}: ${res.statusText}`;
    } catch(e) {
      msg = `HTTP Error ${res.status}`;
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.message || data.error || 'unknown_error');
  }

  return data;
}

export const licenseAdminApi = {
  createLicense: async (params: CreateLicenseParams) => {
    return fetchAdmin('create_license', params);
  },
  listLicenses: async (params: { search?: string; status: string; limit: number; offset: number }) => {
    return fetchAdmin('list_licenses', params);
  },
  revokeLicense: async (license_id: string, reason: string) => {
    return fetchAdmin('revoke_license', { license_id, reason });
  },
  suspendLicense: async (license_id: string, reason: string) => {
    return fetchAdmin('suspend_license', { license_id, reason });
  },
  reactivateLicense: async (license_id: string) => {
    return fetchAdmin('reactivate_license', { license_id });
  },
  resetDevices: async (license_id: string, reason: string) => {
    return fetchAdmin('reset_devices', { license_id, reason });
  },
  listDevices: async (license_id: string) => {
    return fetchAdmin('list_devices', { license_id });
  },
  getAuditLogs: async (license_id: string | null = null, limit = 100) => {
    return fetchAdmin('get_audit_logs', { license_id, limit });
  },
  listCustomers: async () => {
    return fetchAdmin('list_customers');
  }
};
