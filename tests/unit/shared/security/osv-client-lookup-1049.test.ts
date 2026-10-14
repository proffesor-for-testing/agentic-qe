/**
 * #1049: a failed or partial OSV advisory lookup is never a clean result.
 *
 * A local HTTP server stands in for api.osv.dev (no real network). Every
 * failure mode (network error, timeout, 429, 500, malformed JSON, a failed
 * chunk, a failed advisory-detail fetch) must leave the affected packages
 * listed as unchecked with an incomplete/failed status, never as "no vulns".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OSVClient } from '../../../../src/shared/security/osv-client';

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

const LODASH_ADVISORY = {
  id: 'GHSA-35jh-r3h4-6jhm',
  summary: 'Command Injection in lodash',
  details: 'lodash versions prior to 4.17.21 are vulnerable to Command Injection via the template function.',
  aliases: ['CVE-2021-23337'],
  modified: '2024-01-01T00:00:00Z',
  published: '2021-02-15T00:00:00Z',
  severity: [{ type: 'CVSS_V3', score: '7.2' }],
  affected: [{
    package: { name: 'lodash', ecosystem: 'npm' },
    ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }],
  }],
  references: [{ type: 'ADVISORY', url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-23337' }],
};

let server: Server;
let baseUrl: string;
let handler: Handler;
let requests: Array<{ method: string; url: string; body: string }>;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', body });
      handler(req, body, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  handler = (_req, _body, res) => { res.writeHead(500); res.end(); };
});

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

const client = (overrides: Record<string, unknown> = {}) =>
  new OSVClient({ baseUrl, retries: 0, timeout: 2000, enableCache: false, ...overrides });

const PKGS = [
  { name: 'lodash', ecosystem: 'npm' as const, version: '4.17.15' },
  { name: 'left-pad', ecosystem: 'npm' as const, version: '1.3.0' },
];

describe('OSVClient.lookupBatch (#1049)', () => {
  it('network error: every package is unchecked and the lookup failed', async () => {
    // A port nothing listens on: connection refused.
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));

    const lookup = await new OSVClient({ baseUrl: `http://127.0.0.1:${port}`, retries: 0, enableCache: false })
      .lookupBatch(PKGS);

    expect(lookup.status).toBe('failed');
    expect(lookup.packagesChecked).toBe(0);
    expect(lookup.unchecked.map((p) => p.name)).toEqual(['lodash', 'left-pad']);
    expect(lookup.errors.join(' ')).toMatch(/CONNECTION_REFUSED|REQUEST_FAILED/);
    expect(lookup.results.size).toBe(0);
  });

  it('timeout: an unresponsive endpoint is a failed lookup, not a clean one', async () => {
    handler = () => { /* never respond */ };
    const lookup = await client({ timeout: 150 }).lookupBatch(PKGS);
    expect(lookup.status).toBe('failed');
    expect(lookup.unchecked).toHaveLength(2);
    expect(lookup.errors.join(' ')).toMatch(/TIMEOUT/);
  });

  it('HTTP 429: rate limiting is reported, packages unchecked', async () => {
    handler = (_req, _body, res) => json(res, 429, { code: 8, message: 'Too many requests' });
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('failed');
    expect(lookup.unchecked).toHaveLength(2);
    expect(lookup.unchecked[0].reason).toMatch(/429/);
  });

  it('HTTP 500: a server error JSON body is not read as "no vulns"', async () => {
    handler = (_req, _body, res) => json(res, 500, { code: 13, message: 'internal' });
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('failed');
    expect(lookup.unchecked[0].reason).toMatch(/500/);
  });

  it('malformed JSON: an unparseable 200 body is a failed lookup', async () => {
    handler = (_req, _body, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"results": [{'); };
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('failed');
    expect(lookup.unchecked[0].reason).toMatch(/malformed/i);
  });

  it('wrong shape: a 200 body whose results do not match the queries is a failed lookup', async () => {
    handler = (_req, _body, res) => json(res, 200, { results: [{}] }); // 1 result for 2 queries
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('failed');
    expect(lookup.unchecked).toHaveLength(2);
  });

  it('partial batch: one chunk fails, the other chunk reports its real findings', async () => {
    handler = (req, body, res) => {
      if (req.url === '/v1/querybatch') {
        const { queries } = JSON.parse(body) as { queries: Array<{ package: { name: string } }> };
        if (queries[0].package.name === 'left-pad') return json(res, 503, { message: 'unavailable' });
        return json(res, 200, { results: [{ vulns: [{ id: LODASH_ADVISORY.id, modified: LODASH_ADVISORY.modified }] }] });
      }
      if (req.url === `/v1/vulns/${LODASH_ADVISORY.id}`) return json(res, 200, LODASH_ADVISORY);
      return json(res, 404, {});
    };

    const lookup = await client({ batchSize: 1 }).lookupBatch(PKGS);

    expect(lookup.status).toBe('incomplete');
    expect(lookup.packagesChecked).toBe(1);
    expect(lookup.unchecked).toEqual([
      expect.objectContaining({ name: 'left-pad', version: '1.3.0', reason: expect.stringMatching(/503/) }),
    ]);
    const lodash = lookup.results.get('npm:lodash');
    expect(lodash).toHaveLength(1);
    expect(lodash![0]).toMatchObject({ id: LODASH_ADVISORY.id, cveIds: ['CVE-2021-23337'], severity: 'high', affectedPackage: 'lodash' });
    expect(lookup.results.has('npm:left-pad')).toBe(false);
  });

  it('an advisory whose details cannot be fetched leaves its package unchecked', async () => {
    handler = (req, _body, res) => {
      if (req.url === '/v1/querybatch') {
        return json(res, 200, { results: [{ vulns: [{ id: LODASH_ADVISORY.id }] }, {}] });
      }
      return json(res, 500, {});
    };
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('incomplete');
    expect(lookup.unchecked).toEqual([
      expect.objectContaining({ name: 'lodash', reason: expect.stringContaining(LODASH_ADVISORY.id) }),
    ]);
    expect(lookup.results.get('npm:left-pad')).toEqual([]);
  });

  it('a fully successful clean lookup is still complete and clean', async () => {
    handler = (req, _body, res) => json(res, 200, { results: [{}, { vulns: [] }] });
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('complete');
    expect(lookup.packagesChecked).toBe(2);
    expect(lookup.unchecked).toEqual([]);
    expect(lookup.results.get('npm:lodash')).toEqual([]);
    expect(lookup.results.get('npm:left-pad')).toEqual([]);
  });

  it('a successful lookup with findings hydrates the advisory ids the batch endpoint returns', async () => {
    handler = (req, _body, res) => {
      if (req.url === '/v1/querybatch') {
        return json(res, 200, { results: [{ vulns: [{ id: LODASH_ADVISORY.id, modified: LODASH_ADVISORY.modified }] }, {}] });
      }
      if (req.url === `/v1/vulns/${LODASH_ADVISORY.id}`) return json(res, 200, LODASH_ADVISORY);
      return json(res, 404, {});
    };
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('complete');
    expect(lookup.results.get('npm:lodash')![0]).toMatchObject({
      id: LODASH_ADVISORY.id, cveIds: ['CVE-2021-23337'], fixedVersions: ['4.17.21'], severity: 'high',
    });
    expect(requests.filter((r) => r.url.startsWith('/v1/vulns/'))).toHaveLength(1);
  });

  it('drops an advisory the batch endpoint returns when its own SEMVER ranges exclude the version', async () => {
    // Real api.osv.dev behaviour: querybatch for lodash@4.17.15 also returns
    // GHSA-4xc9-xhrj-v574 (fixed in 4.17.11), which /v1/query does not.
    const OLD_FIX = {
      ...LODASH_ADVISORY, id: 'GHSA-4xc9-xhrj-v574', aliases: ['CVE-2018-16487'],
      affected: [
        { package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.11' }] }] },
        { package: { name: 'lodash-rails', ecosystem: 'RubyGems' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }] }] },
      ],
    };
    const UNRANGED = { ...LODASH_ADVISORY, id: 'GHSA-ecos-only', affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }] }] }] };
    const records: Record<string, unknown> = { [LODASH_ADVISORY.id]: LODASH_ADVISORY, [OLD_FIX.id]: OLD_FIX, [UNRANGED.id]: UNRANGED };
    handler = (req, _body, res) => {
      if (req.url === '/v1/querybatch') {
        return json(res, 200, { results: [{ vulns: Object.keys(records).map((id) => ({ id })) }] });
      }
      return json(res, 200, records[decodeURIComponent(req.url!.slice('/v1/vulns/'.length))]);
    };
    const lookup = await client().lookupBatch([PKGS[0]]);
    expect(lookup.status).toBe('complete');
    // In range: reported. Out of its SEMVER range: dropped. Not evaluable (ECOSYSTEM only): kept.
    expect(lookup.results.get('npm:lodash')!.map((v) => v.id).sort()).toEqual(['GHSA-35jh-r3h4-6jhm', 'GHSA-ecos-only']);
  });

  it('a version range that is not a concrete version is unchecked, not queried for every advisory ever', async () => {
    handler = (_req, _body, res) => json(res, 200, { results: [{}] });
    const lookup = await client().lookupBatch([
      { name: 'lodash', ecosystem: 'npm', version: '4.17.15' },
      { name: 'my-lib', ecosystem: 'npm', version: 'github:me/my-lib' },
    ]);
    expect(lookup.status).toBe('incomplete');
    expect(lookup.unchecked).toEqual([expect.objectContaining({ name: 'my-lib', reason: expect.stringMatching(/version/i) })]);
    expect(JSON.parse(requests[0].body).queries).toHaveLength(1);
  });

  it('legacy scanNpmDependencies throws instead of returning [] when the lookup failed', async () => {
    handler = (_req, _body, res) => json(res, 500, {});
    await expect(client().scanNpmDependencies({ lodash: '^4.17.15' })).rejects.toThrow(/could not be checked/);
  });

  it('reads the endpoint from AQE_OSV_API_URL when no baseUrl is configured', async () => {
    const prev = process.env.AQE_OSV_API_URL;
    process.env.AQE_OSV_API_URL = baseUrl;
    try {
      handler = (_req, _body, res) => json(res, 200, { results: [{}] });
      const lookup = await new OSVClient({ retries: 0, enableCache: false }).lookupBatch([PKGS[0]]);
      expect(lookup.status).toBe('complete');
      expect(requests).toHaveLength(1);
    } finally {
      if (prev === undefined) delete process.env.AQE_OSV_API_URL; else process.env.AQE_OSV_API_URL = prev;
    }
  });
});
