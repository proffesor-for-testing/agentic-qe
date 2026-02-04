/**
 * Base Mock Service — Reusable HTTP server for Adidas E2E demo
 *
 * Features:
 * - GET /health — returns 200 or 503 in failure mode
 * - POST /admin/fail — enable failure mode (all requests return 503)
 * - POST /admin/recover — disable failure mode
 * - POST /admin/latency?ms=N — inject artificial latency
 * - Request call tracking for assertions
 * - JSON body parsing
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';

export interface RouteHandler {
  (req: IncomingMessage, res: ServerResponse, body: unknown): void | Promise<void>;
}

export interface CallRecord {
  method: string;
  path: string;
  timestamp: number;
  body: unknown;
}

export interface MockServiceConfig {
  name: string;
  port: number;
}

export class BaseMockService {
  protected readonly routes = new Map<string, RouteHandler>();
  private server: Server | null = null;
  private failureMode = false;
  private latencyMs = 0;
  private calls: CallRecord[] = [];

  constructor(protected readonly config: MockServiceConfig) {
    // Register built-in admin routes
    this.route('GET', '/health', (_req, res) => {
      this.json(res, { status: 'ok', service: this.config.name, uptime: process.uptime() });
    });

    // Default landing page — overridden by services that define their own GET /
    this.route('GET', '/', (_req, res) => {
      const endpoints = Array.from(this.routes.keys())
        .sort()
        .map(key => {
          const [method, path] = key.split(' ', 2);
          const isGet = method === 'GET';
          const link = isGet ? `<a href="${path}">${path}</a>` : path;
          return `<tr><td><code>${method}</code></td><td>${link}</td></tr>`;
        })
        .join('\n          ');

      this.html(res, `<!DOCTYPE html>
<html><head>
  <title>${this.config.name} — :${this.config.port}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #222; }
    h1 { font-size: 1.4rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    td { padding: 6px 12px; border-bottom: 1px solid #eee; }
    td:first-child { width: 60px; text-align: center; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.85rem; }
    a { color: #1a73e8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .status { color: #0a0; }
  </style>
</head><body>
  <h1>${this.config.name} <span style="color:#888">:${this.config.port}</span></h1>
  <p class="status">Running — uptime ${Math.floor(process.uptime())}s</p>
  <table>
    <tr><th>Method</th><th>Endpoint</th></tr>
    ${endpoints}
  </table>
</body></html>`);
    });
  }

  /** Register a route handler */
  route(method: string, path: string, handler: RouteHandler): void {
    this.routes.set(`${method} ${path}`, handler);
  }

  /** Start the HTTP server */
  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (err) {
        console.error(`[${this.config.name}] Error:`, err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, '0.0.0.0', () => {
        console.log(`[${this.config.name}] listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /** Stop the HTTP server */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /** Get recorded calls */
  getCalls(): readonly CallRecord[] {
    return this.calls;
  }

  /** Clear recorded calls */
  clearCalls(): void {
    this.calls = [];
  }

  /** Send JSON response */
  protected json(res: ServerResponse, data: unknown, status = 200): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify(data));
  }

  /** Send HTML response */
  protected html(res: ServerResponse, content: string, status = 200): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(content);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);
    const method = req.method || 'GET';
    const path = url.pathname;

    // CORS preflight
    if (method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.statusCode = 204;
      res.end();
      return;
    }

    // Parse body for POST/PUT
    const body = (method === 'POST' || method === 'PUT') ? await this.parseBody(req) : null;

    // Record call
    this.calls.push({ method, path, timestamp: Date.now(), body });

    // Admin endpoints (always available, even in failure mode)
    if (path === '/admin/fail' && method === 'POST') {
      this.failureMode = true;
      console.log(`[${this.config.name}] FAILURE MODE ENABLED`);
      this.json(res, { status: 'failure_mode_enabled', service: this.config.name });
      return;
    }
    if (path === '/admin/recover' && method === 'POST') {
      this.failureMode = false;
      this.latencyMs = 0;
      console.log(`[${this.config.name}] RECOVERED`);
      this.json(res, { status: 'recovered', service: this.config.name });
      return;
    }
    if (path === '/admin/latency' && method === 'POST') {
      this.latencyMs = parseInt(url.searchParams.get('ms') || '0', 10);
      console.log(`[${this.config.name}] Latency set to ${this.latencyMs}ms`);
      this.json(res, { latency_ms: this.latencyMs });
      return;
    }
    if (path === '/admin/calls' && method === 'GET') {
      this.json(res, { calls: this.calls });
      return;
    }

    // Inject latency
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }

    // Failure mode — return 503 for everything except /admin/*
    if (this.failureMode) {
      console.log(`[${this.config.name}] 503 ${method} ${path} (failure mode)`);
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Service Unavailable',
        service: this.config.name,
        message: `${this.config.name} is currently unavailable`,
      }));
      return;
    }

    // Route to handler
    const handler = this.routes.get(`${method} ${path}`);
    if (handler) {
      console.log(`[${this.config.name}] ${method} ${path}`);
      await handler(req, res, body);
    } else {
      console.log(`[${this.config.name}] 404 ${method} ${path}`);
      this.json(res, { error: 'Not Found', path }, 404);
    }
  }

  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        if (!raw) { resolve(null); return; }
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
      req.on('error', () => resolve(null));
    });
  }
}
