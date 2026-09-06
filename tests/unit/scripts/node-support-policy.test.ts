import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('Node support policy', () => {
  it('declares Node 22.13 as the published runtime floor', () => {
    const manifest = JSON.parse(read('package.json')) as {
      devDependencies?: Record<string, string>;
      engines?: { node?: string };
    };
    const lock = JSON.parse(read('package-lock.json')) as { packages?: Record<string, { engines?: { node?: string } }> };

    expect(manifest.engines?.node).toBe('>=22.13.0');
    expect(manifest.devDependencies?.['@types/node']).toMatch(/^\^22\./);
    expect(lock.packages?.['']?.engines?.node).toBe('>=22.13.0');
  });

  it('uses the same floor for the shipped OpenCode plugin', () => {
    const manifest = JSON.parse(read('packages/aqe-opencode-plugin/package.json')) as {
      engines?: { node?: string };
    };
    const lock = JSON.parse(read('packages/aqe-opencode-plugin/package-lock.json')) as {
      packages?: Record<string, { engines?: { node?: string } }>;
    };

    expect(manifest.engines?.node).toBe('>=22.13.0');
    expect(lock.packages?.['']?.engines?.node).toBe('>=22.13.0');
  });

  it('uses Node 24 for the production container', () => {
    expect(read('Dockerfile').match(/^FROM node:([^\s]+)/gm)).toEqual([
      'FROM node:24-alpine',
      'FROM node:24-alpine',
    ]);
  });

  it('does not run active workflows on unsupported Node 18 or 20', () => {
    const workflows = readdirSync(resolve(root, '.github/workflows'))
      .filter((file) => /\.ya?ml$/.test(file))
      .map((file) => read(`.github/workflows/${file}`))
      .join('\n');

    expect(workflows).not.toMatch(/(?:NODE_VERSION|node-version):\s*['"]?(?:18|20)(?:['".]|$)/m);
  });

  it('runs a compatibility gate on the Node 22 floor', () => {
    const workflow = read('.github/workflows/optimized-ci.yml');

    expect(workflow).toContain('node-version: \'22.13.0\'');
    expect(workflow).toContain('npm run test:unit:fast');
  });

  it('uses Node 24-based majors for official JavaScript actions', () => {
    const workflows = readdirSync(resolve(root, '.github/workflows'))
      .filter((file) => /\.ya?ml$/.test(file))
      .map((file) => read(`.github/workflows/${file}`))
      .join('\n');
    const supportedMajors = {
      cache: 6,
      checkout: 7,
      'download-artifact': 8,
      'github-script': 9,
      'setup-node': 7,
      'upload-artifact': 7,
    };

    for (const [action, major] of Object.entries(supportedMajors)) {
      expect(workflows).not.toMatch(new RegExp(`actions/${action}@v(?!${major}\\b)\\d+`));
    }
  });

  it('pins the default developer runtime to Node 24', () => {
    expect(read('.nvmrc').trim()).toBe('24');
  });
});
