import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const LICENSE_KEY_PEPPER = Deno.env.get("LICENSE_KEY_PEPPER") || "";
const LICENSE_ADMIN_SECRET = Deno.env.get("LICENSE_ADMIN_SECRET") || "";
const ALLOWED_ORIGINS = (Deno.env.get("LICENSE_ADMIN_ALLOWED_ORIGINS") || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

if (ALLOWED_ORIGINS.length === 0) {
  ALLOWED_ORIGINS.push("http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173");
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, body: any, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" }
  });
}

function requireAdmin(req: Request) {
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== LICENSE_ADMIN_SECRET) {
    throw new Error("Unauthorized");
  }
}

async function sha256Hex(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateLicenseKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = 'AECO-';
  for (let i = 0; i < 4; i++) {
    for(let j = 0; j < 4; j++) {
      const randomValues = new Uint8Array(1);
      crypto.getRandomValues(randomValues);
      key += alphabet[randomValues[0] % alphabet.length];
    }
    if (i < 3) key += '-';
  }
  return key;
}

function normalizeLicenseKey(value: string) {
  return value.trim().replace(/\s/g, '').toUpperCase();
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function insertAuditLog(license_id: string | null, device_id: string | null, event_type: string, severity: string, detail: any) {
  await supabaseAdmin.from('license_audit_logs').insert({
    license_id,
    device_id,
    event_type,
    severity,
    detail
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    requireAdmin(req);

    if (req.method !== "POST") {
      return json(405, { ok: false, error: "Method Not Allowed" }, req);
    }

    const body = await req.json();
    const action = body.action;

    if (action === "create_license") {
      const { label, plan, max_devices, expires_at, metadata } = body;
      
      const sanitizedPlan = ['trial', 'standard', 'pro', 'agency', 'lifetime'].includes(plan) ? plan : 'standard';
      const actualMax = Math.max(1, Math.min(20, max_devices || 1));
      const expDate = (plan === 'lifetime' || !expires_at) ? null : new Date(expires_at).toISOString();
      const actualLabel = label ? String(label).substring(0, 120) : null;
      const actualMetadata = (typeof metadata === 'object' && metadata !== null) ? metadata : {};
      
      delete actualMetadata['license_key_hash'];

      let rawKey = "";
      let license_key_hash = "";
      let license_key_prefix = "";
      let id = "";

      for(let i=0; i<5; i++) {
        rawKey = generateLicenseKey();
        const norm = normalizeLicenseKey(rawKey);
        license_key_prefix = norm.substring(0, 9); // AECO-XXXX
        license_key_hash = await sha256Hex(`${norm}${LICENSE_KEY_PEPPER}`);

        const { data, error } = await supabaseAdmin.from('licenses').insert({
          license_key_hash,
          license_key_prefix,
          label: actualLabel,
          plan: sanitizedPlan,
          status: 'active',
          max_devices: actualMax,
          expires_at: expDate,
          metadata: actualMetadata
        }).select('id').single();

        if (error) {
          if (error.code === '23505') { // unique conflict
            continue;
          }
          throw error;
        }
        id = data.id;
        break;
      }

      if (!id) {
        throw new Error("Failed to generate unique license key after 5 retries");
      }

      const { data: license } = await supabaseAdmin.from('licenses').select('*').eq('id', id).single();
      
      await insertAuditLog(id, null, 'license_created', 'info', { source: 'admin', metadata: actualMetadata });

      const safeLicense = { ...license };
      delete safeLicense.license_key_hash;

      return json(200, {
        ok: true,
        license: {
          ...safeLicense,
          license_key: rawKey // ONLY RETURNED ONCE
        }
      }, req);
    }

    if (action === "list_licenses") {
      const { search, status, limit, offset } = body;
      
      let query = supabaseAdmin.from('licenses').select('*, license_devices(id, status)', { count: 'exact' });
      
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      
      if (search) {
        query = query.or(`label.ilike.%${search}%,license_key_prefix.ilike.%${search}%`);
      }

      const l = Math.min(100, limit || 50);
      const o = offset || 0;

      query = query.order('created_at', { ascending: false }).range(o, o + l - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      const items = data.map(d => {
        const safe = { ...d };
        delete safe.license_key_hash;
        
        safe.active_devices_count = (d.license_devices || []).filter((ld: any) => ld.status === 'active').length;
        delete safe.license_devices;
        return safe;
      });

      return json(200, { ok: true, items, count }, req);
    }

    if (action === "revoke_license") {
      const { license_id, reason } = body;
      
      if (!license_id) throw new Error("Missing license_id");

      await supabaseAdmin.from('licenses').update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoke_reason: reason || 'Manual revoke',
        updated_at: new Date().toISOString()
      }).eq('id', license_id);

      await supabaseAdmin.from('license_devices').update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoke_reason: 'license_revoked',
        updated_at: new Date().toISOString()
      }).eq('license_id', license_id).eq('status', 'active');

      await insertAuditLog(license_id, null, 'license_revoked', 'warning', { reason });

      return json(200, { ok: true }, req);
    }

    if (action === "suspend_license") {
      const { license_id, reason } = body;
      if (!license_id) throw new Error("Missing license_id");

      await supabaseAdmin.from('licenses').update({
        status: 'suspended',
        updated_at: new Date().toISOString()
      }).eq('id', license_id);

      await insertAuditLog(license_id, null, 'license_suspended', 'warning', { reason });

      return json(200, { ok: true }, req);
    }

    if (action === "reactivate_license") {
      const { license_id } = body;
      if (!license_id) throw new Error("Missing license_id");

      await supabaseAdmin.from('licenses').update({
        status: 'active',
        revoked_at: null,
        revoke_reason: null,
        updated_at: new Date().toISOString() // Let DB handle updated_at or pass it explicitly just in case
      }).eq('id', license_id);

      await insertAuditLog(license_id, null, 'license_reactivated', 'info', { source: 'admin' });

      return json(200, { ok: true }, req);
    }

    if (action === "reset_devices") {
      const { license_id, reason } = body;
      if (!license_id) throw new Error("Missing license_id");

      await supabaseAdmin.from('license_devices').update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoke_reason: reason || 'Admin reset',
        updated_at: new Date().toISOString()
      }).eq('license_id', license_id).eq('status', 'active');

      await insertAuditLog(license_id, null, 'license_devices_reset', 'info', { reason });

      return json(200, { ok: true }, req);
    }

    if (action === "list_devices") {
      const { license_id } = body;
      if (!license_id) throw new Error("Missing license_id");

      const { data, error } = await supabaseAdmin.from('license_devices')
        .select('*')
        .eq('license_id', license_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const items = data.map(d => {
        const safe = { ...d };
        delete safe.machine_id_hash;
        return safe;
      });

      return json(200, { ok: true, items }, req);
    }

    if (action === "get_audit_logs") {
       const { license_id, limit } = body;

       let query = supabaseAdmin.from('license_audit_logs').select('*').order('created_at', { ascending: false });
       if (license_id) {
           query = query.eq('license_id', license_id);
       }
       query = query.limit(Math.min(100, limit || 100));

       const { data, error } = await query;
       if (error) throw error;

       return json(200, { ok: true, items: data }, req);
    }

    if (action === "list_customers") {
      const { data, error } = await supabaseAdmin.from('licenses')
        .select('metadata, created_at, plan, status, id, expires_at, label');

      if (error) throw error;

      // Group by email, fallback to name, fallback to label
      const map = new Map<string, any>();
      for (const d of data) {
        let key = d.metadata?.customer_email?.toLowerCase();
        if (!key) key = d.metadata?.customer_name?.toLowerCase();
        if (!key) key = d.label;
        if (!key) key = 'unknown_' + d.id;

        if (!map.has(key)) {
          map.set(key, {
            customer_email: d.metadata?.customer_email || 'N/A',
            customer_name: d.metadata?.customer_name || d.label || 'Unknown',
            licenses: [],
            total_licenses: 0,
            first_seen: d.created_at
          });
        }
        const state = map.get(key);
        state.licenses.push({
          plan: d.plan,
          status: d.status,
          expires_at: d.expires_at,
          created_at: d.created_at
        });
        state.total_licenses += 1;
        if (new Date(d.created_at) < new Date(state.first_seen)) {
          state.first_seen = d.created_at;
        }
      }

      return json(200, { ok: true, items: Array.from(map.values()) }, req);
    }

    return json(400, { ok: false, error: "Unknown Action" }, req);
  } catch (error: any) {
    console.error(error);
    if (error.message === "Unauthorized") {
      return json(401, { ok: false, error: "Unauthorized" }, req);
    }
    return json(500, { ok: false, error: "Internal Server Error", message: error.message }, req);
  }
});
