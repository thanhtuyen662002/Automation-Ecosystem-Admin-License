import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "admin-license-proxy" });
  });

  // Proxy endpoint for license-admin
  app.post("/api/license-admin", async (req, res) => {
    try {
      let supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
      let functionUrl = process.env.VITE_LICENSE_ADMIN_FUNCTION_URL?.trim();
      
      if (!functionUrl) {
        if (!supabaseUrl) {
          supabaseUrl = 'https://twkqwtpgahjusofcpivw.supabase.co';
        }
        supabaseUrl = supabaseUrl.replace(/\/+$/, '');
        functionUrl = `${supabaseUrl}/functions/v1/license-admin`;
      }

      console.log("[proxy] received action:", req.body?.action);
      console.log("[proxy] forwarding to:", functionUrl);

      // We read the headers from frontend or fallback to env vars
      const authHeader = req.headers.authorization;
      const apiKeyHead = req.headers.apikey as string;
      const adminSecret = req.headers['x-admin-secret'] as string || process.env.LICENSE_ADMIN_SECRET;

      const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
      const finalAuthHeader = authHeader || `Bearer ${anonKey}`;
      const finalApiKey = apiKeyHead || anonKey || '';

      if (!finalApiKey || finalApiKey === 'undefined') {
        return res.status(500).json({ ok: false, error: "MISSING_ANON_KEY", message: "VITE_SUPABASE_ANON_KEY is missing" });
      }

      if (!adminSecret) {
         return res.status(401).json({ ok: false, error: "MISSING_ADMIN_SECRET", message: "Admin secret is missing" });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      let response: Response;
      try {
        response = await fetch(functionUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': finalAuthHeader,
            'apikey': finalApiKey,
            'Content-Type': 'application/json',
            'x-admin-secret': adminSecret,
          },
          body: JSON.stringify(req.body),
        });
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return res.status(504).json({ ok: false, error: "UPSTREAM_TIMEOUT", message: "Supabase license-admin timeout after 15s" });
        }
        return res.status(500).json({ ok: false, error: "PROXY_FETCH_FAILED", message: err?.message || String(err) });
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await response.text();
      console.log("[proxy] upstream status:", response.status);
      console.log("[proxy] upstream body preview:", text.slice(0, 500));

      res.status(response.status);
      res.setHeader("Content-Type", response.headers.get("content-type") || "application/json");
      return res.send(text);
    } catch (error: any) {
      console.error('[server proxy] error calling license-admin:', error);
      res.status(500).json({ ok: false, error: 'Proxy error', message: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
