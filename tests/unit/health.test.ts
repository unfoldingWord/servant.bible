import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/generated/version.js';

// The Worker under test, reached through its own fetch handler inside workerd.
// `Cloudflare.Exports` is empty until `wrangler types` generates it, so name the shape here.
type WorkerExports = { default: { fetch(input: string, init?: RequestInit): Promise<Response> } };
const worker = (exports as unknown as WorkerExports).default;

describe('GET /health', () => {
  it('reports the deployed version as JSON', async () => {
    const response = await worker.fetch('https://example.com/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: 'healthy', version: APP_VERSION, environment: 'production' });
  });

  it('only answers GET', async () => {
    const response = await worker.fetch('https://example.com/health', { method: 'POST' });

    expect(response.status).toBe(404);
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
  it('serves the static page from the asset binding', async () => {
    const response = await worker.fetch('https://example.com/');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Servant.Bible');
  });
});
