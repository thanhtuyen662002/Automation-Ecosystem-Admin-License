import { CreateLicenseParams } from '../types/licenseAdmin';

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function getSupabaseUrl(): string {
  const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  return (envUrl || 'https://twkqwtpgahjusofcpivw.supabase.co').replace(/\/+$/, '');
}

export function shouldUseProxy(): boolean {
  const forceDirect = import.meta.env.VITE_USE_DIRECT_SUPABASE_FUNCTION === 'true';
  if (forceDirect) return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('run.app') || host.includes('ais-dev');
}

export function getAdminFunctionUrl(): string {
  if (typeof window !== 'undefined' && shouldUseProxy()) {
    return '/api/license-admin';
  }
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

const HARD_TIMEOUT_MS = 20000;

function timeoutPromise(ms: number, url: string, action: string): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => {
      reject(new Error(`Request timeout sau ${ms / 1000}s. Request có thể bị AI Studio preview/CORS/network chặn trước khi tới Supabase. URL: ${url}. Action: ${action}`));
    }, ms);
  });
}

async function fetchWithHardTimeout(url: string, init: RequestInit, action: string) {
  const controller = new AbortController();
  const abortTimer = window.setTimeout(() => controller.abort(), HARD_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout sau ${HARD_TIMEOUT_MS / 1000}s. Request có thể bị AI Studio preview/CORS/network chặn trước khi tới Supabase. URL: ${url}. Action: ${action}`);
    }
    throw err;
  } finally {
    window.clearTimeout(abortTimer);
  }
}

async function fetchAdmin(action: string, payload: any = {}) {
  const adminSecret = getAdminSecret();
  if (!adminSecret) throw new Error('missing_secret');

  const url = getAdminFunctionUrl();

  console.info('[license-admin] start', {
    url,
    action,
    origin: window?.location?.origin,
    hasAnonKey: Boolean(anonKey),
    hasAdminSecret: Boolean(adminSecret),
  });

  let res: Response;

  try {
    res = await fetchWithHardTimeout(
      url,
      {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({ action, ...payload }),
      },
      action
    );
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timeout: license-admin không phản hồi sau 20 giây. URL: ${url}`);
    }
    console.error('[license-admin] fetch failed before response', err);
    throw new Error(
      err?.message ||
      `Không gọi được license-admin. Có thể request bị chặn bởi AI Studio preview/CORS/network trước khi tới Supabase. URL: ${url}`
    );
  }

  const status = res.status;
  const text = await res.text();

  console.info('[license-admin] response', {
    url,
    action,
    status,
    bodyPreview: text.slice(0, 300),
  });

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`license-admin trả về response không phải JSON. HTTP ${status}. Body: ${text.slice(0, 500)}`);
  }

  if (status === 401) throw new Error('unauthorized');
  if (status === 403) throw new Error('forbidden');

  if (!res.ok || data?.ok !== true) {
    throw new Error(data?.message || data?.error || `HTTP ${status}: ${res.statusText}`);
  }

  if (action === "create_license" && !data?.license?.license_key) {
    throw new Error(
      `create_license thành công nhưng response không có license_key. Thử lại hoặc kiểm tra server proxy.`
    );
  }

  return data;
}

export const licenseAdminApi = {
  testConnection: async () => {
    return fetchAdmin('list_licenses', {
      search: '',
      status: 'all',
      limit: 1,
      offset: 0,
    });
  },
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
