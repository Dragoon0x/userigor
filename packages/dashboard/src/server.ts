#!/usr/bin/env node
/**
 * `rigor-dashboard` — local web dashboard for userigor.
 *
 * Serves a single-page console at http://localhost:7717 (configurable) that
 * reads metrics, patterns, and time-series straight from the local SQLite
 * store via @userigor/core.
 *
 * Design choices:
 *   - Pure node:http (no Express). One package dep: @userigor/core.
 *   - Static UI is one HTML file shipped under ./static.
 *   - JSON API is a handful of endpoints under /api.
 *   - Localhost only by default. Pass --host 0.0.0.0 to expose.
 *
 * Usage:
 *   rigor-dashboard
 *   rigor-dashboard --port 8080
 *   rigor-dashboard --db /path/to/data.db
 *   rigor-dashboard --host 127.0.0.1
 */
import { createServer as createHttp, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Rigor,
  computePatternImpact,
  timeSeries,
  type MetricName,
  type Pattern
} from '@userigor/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ServerOptions {
  dbPath?: string;
  port?: number;
  host?: string;
  staticDir?: string;
}

interface ResolvedOptions {
  dbPath: string;
  port: number;
  host: string;
  staticDir: string;
}

const VALID_METRICS: ReadonlySet<MetricName> = new Set([
  'first_try_acceptance',
  'edit_after_accept',
  'revert_rate',
  'correction_velocity',
  'drift_distance',
  'pattern_coverage'
]);

function loadConfigDbPath(): string {
  const cfgPath = resolve(homedir(), '.rigor', 'config.json');
  if (existsSync(cfgPath)) {
    try {
      const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
      if (raw.dbPath) return raw.dbPath;
    } catch {
      // fall through
    }
  }
  return resolve(homedir(), '.rigor', 'data.db');
}

function loadConfigAgentRepo(): { agent: string; repo: string } {
  const cfgPath = resolve(homedir(), '.rigor', 'config.json');
  if (existsSync(cfgPath)) {
    try {
      const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
      return {
        agent: raw.agent ?? 'unknown',
        repo: raw.repo ?? process.cwd()
      };
    } catch {
      // fall through
    }
  }
  return { agent: 'unknown', repo: process.cwd() };
}

function resolveOptions(opts: ServerOptions): ResolvedOptions {
  return {
    dbPath: opts.dbPath ?? loadConfigDbPath(),
    port: opts.port ?? 7717,
    host: opts.host ?? '127.0.0.1',
    staticDir: opts.staticDir ?? resolve(__dirname, '..', 'static')
  };
}

function send(res: ServerResponse, status: number, body: unknown, contentType = 'application/json'): void {
  res.writeHead(status, {
    'content-type': contentType + '; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function sendJsonError(res: ServerResponse, status: number, message: string): void {
  send(res, status, { error: message });
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf('?');
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : '');
}

function safeStaticPath(staticDir: string, urlPath: string): string | null {
  // Map "/" to "/index.html"
  let p = urlPath === '/' ? '/index.html' : urlPath;
  // Strip query
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  // Reject parent traversal
  if (p.includes('..')) return null;
  const full = resolve(staticDir, '.' + p);
  if (!full.startsWith(staticDir)) return null;
  return existsSync(full) ? full : null;
}

function contentTypeFor(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function patternToJson(p: Pattern): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    size: p.size,
    density: p.density,
    status: p.status,
    injection_count: p.injection_count,
    impact_score: p.impact_score,
    repos: p.repos,
    languages: p.languages,
    created_at: p.created_at,
    updated_at: p.updated_at
  };
}

/**
 * Build a node:http server bound to a Rigor instance. Exposed as a helper
 * for tests; the binary entry point uses startServer below which also
 * handles lifecycle.
 */
export function buildServer(rigor: Rigor, staticDir: string): Server {
  return createHttp((req: IncomingMessage, res: ServerResponse) => {
    void handleRequest(req, res, rigor, staticDir).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendJsonError(res, 500, msg);
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rigor: Rigor,
  staticDir: string
): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // CORS for local tools that may want to embed.
  res.setHeader('access-control-allow-origin', '*');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- API ----
  if (url.startsWith('/api/status')) {
    const cfg = loadConfigAgentRepo();
    const corrections = rigor.listCorrections();
    const patterns = rigor.listPatterns();
    return send(res, 200, {
      db_path: (rigor.store as unknown as { path?: string }).path ?? '',
      agent: cfg.agent,
      repo: cfg.repo,
      corrections: corrections.length,
      patterns_total: patterns.length,
      patterns_active: patterns.filter((p) => p.status === 'active').length,
      patterns_candidate: patterns.filter((p) => p.status === 'candidate').length,
      patterns_retired: patterns.filter((p) => p.status === 'retired').length
    });
  }

  if (url.startsWith('/api/metrics')) {
    const q = parseQuery(url);
    const since = parseInt(q.get('since') ?? '0', 10) || (Date.now() - 30 * 24 * 60 * 60 * 1000);
    const until = parseInt(q.get('until') ?? '0', 10) || Date.now();
    const snap = rigor.metrics({ since, until });
    return send(res, 200, snap);
  }

  if (url.startsWith('/api/series')) {
    const q = parseQuery(url);
    const name = (q.get('name') ?? 'first_try_acceptance') as MetricName;
    if (!VALID_METRICS.has(name)) return sendJsonError(res, 400, `unknown metric: ${name}`);
    const days = Math.max(1, Math.min(365, parseInt(q.get('days') ?? '14', 10) || 14));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const series = timeSeries(rigor.store, name, {
      since,
      bucketMs: 24 * 60 * 60 * 1000
    });
    return send(res, 200, series);
  }

  // /api/patterns/<id>  → detail with causal evidence
  const detailMatch = url.match(/^\/api\/patterns\/([^/?]+)\/?($|\?)/);
  if (detailMatch) {
    const idOrName = decodeURIComponent(detailMatch[1]);
    const all = rigor.listPatterns();
    const p = all.find((x) => x.id === idOrName || x.name === idOrName);
    if (!p) return sendJsonError(res, 404, `pattern not found: ${idOrName}`);
    const causal = p.injection_count >= 5 ? computePatternImpact(rigor.store, p.id) : null;
    return send(res, 200, {
      pattern: patternToJson(p),
      causal_evidence: causal
    });
  }

  if (url.startsWith('/api/patterns')) {
    const q = parseQuery(url);
    const status = q.get('status') ?? 'all';
    const limit = Math.max(1, Math.min(500, parseInt(q.get('limit') ?? '100', 10) || 100));
    const filter: { status?: Pattern['status']; limit: number } = { limit };
    if (status !== 'all') filter.status = status as Pattern['status'];
    const patterns = rigor.store.listPatterns(filter);
    return send(res, 200, patterns.map(patternToJson));
  }

  // ---- STATIC ----
  if (method === 'GET' || method === 'HEAD') {
    const filePath = safeStaticPath(staticDir, url);
    if (filePath) {
      const body = readFileSync(filePath);
      res.writeHead(200, {
        'content-type': contentTypeFor(filePath) + '; charset=utf-8',
        'cache-control': 'no-store'
      });
      res.end(body);
      return;
    }
  }

  return sendJsonError(res, 404, 'not found');
}

export interface RunningServer {
  rigor: Rigor;
  server: Server;
  url: string;
  close(): Promise<void>;
}

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const resolved = resolveOptions(opts);
  return new Promise((resolveStart, reject) => {
    let rigor: Rigor;
    try {
      rigor = new Rigor({ dbPath: resolved.dbPath });
      rigor.init();
    } catch (err) {
      reject(err);
      return;
    }
    const server = buildServer(rigor, resolved.staticDir);
    server.on('error', (err) => reject(err));
    server.listen(resolved.port, resolved.host, () => {
      const url = `http://${resolved.host}:${resolved.port}`;
      resolveStart({
        rigor,
        server,
        url,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              try { rigor.close(); } catch { /* already closed */ }
              done();
            });
          })
      });
    });
  });
}

function parseCli(argv: string[]): ServerOptions & { help?: boolean } {
  const out: ServerOptions & { help?: boolean } = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--port' || a === '-p') out.port = parseInt(argv[++i], 10);
    else if (a === '--host') out.host = argv[++i];
    else if (a === '--db') out.dbPath = argv[++i];
    else if (a === '--static') out.staticDir = argv[++i];
  }
  return out;
}

const HELP = `rigor-dashboard · local console for userigor

Usage:
  rigor-dashboard                       Start at http://127.0.0.1:7717
  rigor-dashboard --port 8080           Custom port
  rigor-dashboard --host 0.0.0.0        Expose on all interfaces
  rigor-dashboard --db <path>           Custom db path
`;

const isDirectExecution =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('rigor-dashboard');

if (isDirectExecution) {
  const flags = parseCli(process.argv);
  if (flags.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  startServer(flags)
    .then((running) => {
      process.stdout.write(`rigor-dashboard ▸ ${running.url}\n`);
      const shutdown = () => {
        running.close().finally(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`rigor-dashboard failed: ${msg}\n`);
      process.exit(1);
    });
}
