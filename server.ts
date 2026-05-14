import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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

      // We read the headers from frontend or fallback to env vars
      const authHeader = req.headers.authorization;
      const apiKeyHead = req.headers.apikey as string;
      const adminSecret = req.headers['x-admin-secret'] as string || process.env.LICENSE_ADMIN_SECRET;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader || `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': apiKeyHead || process.env.VITE_SUPABASE_ANON_KEY || '',
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret || '',
        },
        body: JSON.stringify(req.body),
      });

      const text = await response.text();
      res.status(response.status).send(text);
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
