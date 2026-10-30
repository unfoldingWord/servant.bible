import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import servers from '../../servers.json';
import { APP_VERSION } from '../../src/generated/version.js';
import { loadRegistry, routableCount } from '../../src/registry.js';

// The Worker as bundled from wrangler.toml, reached through its own fetch
// handler inside workerd, with the real servers.json. `Cloudflare.Exports` is
// empty until `wrangler types` generates it, so name the shape here.
type WorkerExports = { default: { fetch(input: string, init?: RequestInit): Promise<Response> } };
const worker = (exports as unknown as WorkerExports).default;

describe('GET /health', () => {
  it('reports the deployed version and the servers it routes', async () => {
    const response = await worker.fetch('https://example.com/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      status: 'healthy',
      version: APP_VERSION,
      environment: 'production',
      servers: routableCount(loadRegistry(servers)),
    });
  });

  it('only answers GET and HEAD', async () => {
    const response = await worker.fetch('https://example.com/health', { method: 'POST' });

    expect(response.status).toBe(405);
  });
});

describe('unknown paths', () => {
  it('returns a short JSON 404 and never forwards a guess', async () => {
    const response = await worker.fetch('https://example.com/org/nobody/server/none/mcp');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'not found' });
  });
});

describe('GET /', () => {
  // wrangler.toml carries no page credential (ADR 0006, decision 3), so the
  // Worker as bundled from it must fail closed, never serve the page open.
  // router.test.ts and gate.test.ts prove the asset page behind a credential.
  it('fails closed as bundled, because the credential is a secret and not in wrangler.toml', async () => {
    const response = await worker.fetch('https://example.com/');

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'page gate not configured' });
  });
});

describe('GET /mcp.json', () => {
  it('serves the real list with every entry', async () => {
    const response = await worker.fetch('https://example.com/mcp.json');

    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[] };
    expect(body.entries).toHaveLength(servers.entries.length);
  });
});
