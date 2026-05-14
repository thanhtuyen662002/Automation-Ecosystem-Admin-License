import { CreateLicenseParams } from '../types/licenseAdmin';

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function getSupabaseUrl(): string {
  const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  return (envUrl || 'https://twkqwtpgahjusofcpivw.supabase.co').replace(/\/+$/, '');
}

export function getAdminFunctionUrl(): string {
  const customUrl = import.meta.env.VITE_LICENSE_ADMIN_FUNCTION_URL?.trim();
  if (customUrl) return customUrl;
  return `${getSupabaseUrl()}/functions/v1/license-admin`;
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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

  let res: Response;

  try {
    console.info('[license-admin] calling', { url, action });

    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecret,
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timeout: license-admin không phản hồi sau 20 giây. URL: ${url}`);
    }

    throw new Error(
      `Không gọi được license-admin. Có thể sai URL, bị CORS, mất mạng, hoặc function chưa deploy. URL: ${url}. Chi tiết: ${err?.message || String(err)}`
    );
  } finally {
    window.clearTimeout(timeoutId);
  }

  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`license-admin trả về response không phải JSON. HTTP ${res.status}. Body: ${text.slice(0, 500)}`);
  }

  if (res.status === 401) {
    throw new Error('unauthorized');
  }

  if (res.status === 403) {
    throw new Error('forbidden');
  }

  if (!res.ok || data?.ok !== true) {
    throw new Error(data?.message || data?.error || `HTTP ${res.status}: ${res.statusText}`);
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
