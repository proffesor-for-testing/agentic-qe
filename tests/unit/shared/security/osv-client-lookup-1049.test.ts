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
import { OSVClient, resolveOSVBaseUrl } from '../../../../src/shared/security/osv-client';
import { advisoryAffectsVersion } from '../../../../src/shared/security/osv-lookup';

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
    const lodash = lookup.results.get('npm:lodash@4.17.15');
    expect(lodash).toHaveLength(1);
    expect(lodash![0]).toMatchObject({ id: LODASH_ADVISORY.id, cveIds: ['CVE-2021-23337'], severity: 'high', affectedPackage: 'lodash' });
    expect(lookup.results.has('npm:left-pad@1.3.0')).toBe(false);
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
    expect(lookup.results.get('npm:left-pad@1.3.0')).toEqual([]);
  });

  it('a paginated (truncated) batch entry leaves its package unchecked', async () => {
    handler = (_req, _body, res) => json(res, 200, { results: [{ vulns: [{ id: 'GHSA-a' }], next_page_token: 'more' }, {}] });
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('incomplete');
    expect(lookup.unchecked).toEqual([expect.objectContaining({ name: 'lodash', reason: expect.stringMatching(/truncated/) })]);
    expect(lookup.results.get('npm:left-pad@1.3.0')).toEqual([]);
  });

  it('a fully successful clean lookup is still complete and clean', async () => {
    handler = (req, _body, res) => json(res, 200, { results: [{}, { vulns: [] }] });
    const lookup = await client().lookupBatch(PKGS);
    expect(lookup.status).toBe('complete');
    expect(lookup.packagesChecked).toBe(2);
    expect(lookup.unchecked).toEqual([]);
    expect(lookup.results.get('npm:lodash@4.17.15')).toEqual([]);
    expect(lookup.results.get('npm:left-pad@1.3.0')).toEqual([]);
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
    expect(lookup.results.get('npm:lodash@4.17.15')![0]).toMatchObject({
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
    expect(lookup.results.get('npm:lodash@4.17.15')!.map((v) => v.id).sort()).toEqual(['GHSA-35jh-r3h4-6jhm', 'GHSA-ecos-only']);
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

  describe('review round 2', () => {
    const withEnv = async (value: string, fn: () => Promise<void>) => {
      const prev = process.env.AQE_OSV_API_URL;
      process.env.AQE_OSV_API_URL = value;
      try { await fn(); } finally {
        if (prev === undefined) delete process.env.AQE_OSV_API_URL; else process.env.AQE_OSV_API_URL = prev;
      }
    };

    it.each(['ftp://evil', 'api.osv.dev', 'http://example.com', 'not a url'])(
      'B1: an invalid AQE_OSV_API_URL (%s) never throws at construction; the lookup fails with the reason',
      async (value) => {
        await withEnv(value, async () => {
          const osv = new OSVClient({ retries: 0, enableCache: false }); // must not throw
          const lookup = await osv.lookupBatch(PKGS);
          expect(lookup.status).toBe('failed');
          expect(lookup.unchecked).toHaveLength(2);
          expect(lookup.unchecked[0].reason).toMatch(/AQE_OSV_API_URL/);
          expect(requests).toHaveLength(0);
        });
      },
    );

    it('B1: http is allowed only for loopback; https anywhere', () => {
      expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: 'https://osv.internal.example/' })).toBe('https://osv.internal.example');
      expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://localhost:8080' })).toBe('http://localhost:8080');
      expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://127.0.0.1:9' })).toBe('http://127.0.0.1:9');
      expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://[::1]:9' })).toBe('http://[::1]:9');
      expect(() => resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://osv.example.com' })).toThrow(/https/);
      expect(resolveOSVBaseUrl({})).toBe('https://api.osv.dev');
    });

    it.each([
      ['<4.17.12'], ['>4.17.4'], ['<=4.17.12'], ['>=4.17.0'], ['^4.17.15'], ['~4.17.15'], ['4.x'], ['*'],
      ['1.0.0 || 2.0.0'], ['1.0.0 - 2.0.0'], ['latest'], ['workspace:*'], ['file:../x'], ['link:../x'],
      ['git+https://github.com/a/b.git'], ['github:a/b'], ['npm:other@^1.0.0'],
    ])('B2: spec %s without a lockfile is unchecked, never guessed', async (spec) => {
      handler = (_req, _body, res) => json(res, 200, { results: [] });
      const lookup = await client().lookupNpmDependencies({ lodash: spec });
      expect(lookup.status).toBe('failed');
      expect(lookup.unchecked).toEqual([expect.objectContaining({ name: 'lodash', reason: expect.stringMatching(/no lockfile resolution|not a registry dependency|local package/) })]);
      expect(requests).toHaveLength(0);
    });

    it.each([['4.17.15', '4.17.15'], ['=4.17.15', '4.17.15'], ['v4.17.15', '4.17.15']])(
      'B2: an exact spec (%s) is checked as %s', async (spec, version) => {
        handler = (_req, _body, res) => json(res, 200, { results: [{}] });
        const lookup = await client().lookupNpmDependencies({ lodash: spec });
        expect(lookup.status).toBe('complete');
        expect(JSON.parse(requests[0].body).queries[0].version).toBe(version);
      });

    it('B2: the lockfile version wins over the manifest range', async () => {
      handler = (_req, _body, res) => json(res, 200, { results: [{}, {}] });
      const lookup = await client().lookupNpmDependencies(
        { lodash: '<4.17.12', 'left-pad': '^1.3.0' }, { lodash: '4.17.11', 'left-pad': '1.3.0' });
      expect(lookup.status).toBe('complete');
      expect(JSON.parse(requests[0].body).queries.map((q: { version: string }) => q.version)).toEqual(['4.17.11', '1.3.0']);
    });

    it('4: two versions of one package are kept apart (keyed name@version)', async () => {
      handler = (req, body, res) => {
        if (req.url === '/v1/querybatch') {
          const qs = (JSON.parse(body) as { queries: Array<{ version: string }> }).queries;
          return json(res, 200, { results: qs.map((q) => (q.version === '4.17.11' ? { vulns: [{ id: LODASH_ADVISORY.id }] } : {})) });
        }
        return json(res, 200, LODASH_ADVISORY);
      };
      const lookup = await client().lookupBatch([
        { name: 'lodash', ecosystem: 'npm', version: '4.17.11' },
        { name: 'lodash', ecosystem: 'npm', version: '4.17.21' },
      ]);
      expect(lookup).toMatchObject({ status: 'complete', packagesChecked: 2, unchecked: [] });
      expect(lookup.results.get('npm:lodash@4.17.11')).toHaveLength(1);
      expect(lookup.results.get('npm:lodash@4.17.21')).toEqual([]);
    });

    it('bounded: a reason naming missing advisory details lists at most 5 ids', async () => {
      const ids = Array.from({ length: 12 }, (_, i) => `GHSA-${i}`);
      handler = (req, _body, res) => req.url === '/v1/querybatch'
        ? json(res, 200, { results: [{ vulns: ids.map((id) => ({ id })) }] })
        : json(res, 500, {});
      const lookup = await client().lookupBatch([PKGS[0]]);
      expect(lookup.unchecked[0].reason).toMatch(/GHSA-0, GHSA-1, GHSA-2, GHSA-3, GHSA-4 and 7 more/);
    });
  });

  describe('review round 3', () => {
    it('5: loopback means localhost or a 127/8 or ::1 IP literal, not a DNS name starting with 127.', () => {
      expect(() => resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://127.evil.com' })).toThrow(/https/);
      expect(() => resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://127.0.0.1.nip.io' })).toThrow(/https/);
      expect(() => resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://localhost.evil.com' })).toThrow(/https/);
      expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://127.0.0.2:9' })).toBe('http://127.0.0.2:9');
      expect(resolveOSVBaseUrl({ AQE_OSV_API_URL: 'http://[::1]:9' })).toBe('http://[::1]:9');
    });

    it('2: querybatch sends version at the top level of each query (OSV ignores package.version)', async () => {
      handler = (_req, _body, res) => json(res, 200, { results: [{}, {}] });
      await client().lookupBatch(PKGS);
      const queries = JSON.parse(requests[0].body).queries;
      expect(queries).toEqual([
        { package: { name: 'lodash', ecosystem: 'npm' }, version: '4.17.15' },
        { package: { name: 'left-pad', ecosystem: 'npm' }, version: '1.3.0' },
      ]);
    });

    it('2: queryPackage and a PyPI requirements scan send version at the top level too', async () => {
      handler = (req, _body, res) => json(res, 200, req.url === '/v1/query' ? { vulns: [] } : { results: [{}] });
      await client().queryPackage('django', 'PyPI', '3.2.0');
      expect(JSON.parse(requests[0].body)).toEqual({ package: { name: 'django', ecosystem: 'PyPI' }, version: '3.2.0' });
      await client().scanPythonRequirements('django==3.2.0\n');
      expect(JSON.parse(requests[1].body).queries).toEqual([{ package: { name: 'django', ecosystem: 'PyPI' }, version: '3.2.0' }]);
    });

    it('4: an npm alias is looked up as the real package', async () => {
      handler = (_req, _body, res) => json(res, 200, { results: [{}] });
      const lookup = await client().lookupNpmDependencies({ x: 'npm:lodash@4.17.11' });
      expect(lookup.status).toBe('complete');
      expect(JSON.parse(requests[0].body).queries).toEqual([{ package: { name: 'lodash', ecosystem: 'npm' }, version: '4.17.11' }]);
    });
  });

  describe('range evaluator edge cases', () => {
    const adv = (events: Array<Record<string, string>>) => ({ affected: [{ package: { name: 'p', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events }] }] });
    it('introduced "0" covers a 0.0.0 prerelease', () => {
      expect(advisoryAffectsVersion(adv([{ introduced: '0' }, { fixed: '1.0.0' }]), { name: 'p', ecosystem: 'npm', version: '0.0.0-alpha' })).toBe(true);
    });
    it('unsorted events with a tie (fixed X before introduced X) evaluate correctly', () => {
      const events = [{ introduced: '2.0.0' }, { fixed: '3.0.0' }, { introduced: '1.0.0' }, { fixed: '2.0.0' }];
      expect(advisoryAffectsVersion(adv(events), { name: 'p', ecosystem: 'npm', version: '2.5.0' })).toBe(true);
      expect(advisoryAffectsVersion(adv(events), { name: 'p', ecosystem: 'npm', version: '3.0.0' })).toBe(false);
      expect(advisoryAffectsVersion(adv(events), { name: 'p', ecosystem: 'npm', version: '1.5.0' })).toBe(true);
    });
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
