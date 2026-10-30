import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/generated/version.js';
import { SCHEMA_URL } from '../../src/list.js';
import { createRouter, type Env } from '../../src/router.js';
import { FIXTURE_ROUTABLE, echo, echoBinding, fixtureRegistry, type Echo } from './fixtures.js';

// The router assembled from its parts, with the fixture registry, a stub
// public fetch, a stub binding, and the real ASSETS binding from wrangler.toml.

const SCHEMA = { $id: SCHEMA_URL, title: 'fixture schema' };

const router = createRouter({ registry: fixtureRegistry, schema: SCHEMA, fetch: (r) => echo(r) });

// The page credential (ADR 0006) is a Worker secret, so wrangler.toml never
// carries it; the tests supply one. gate.test.ts covers the gate itself.
const PAGE = { PAGE_USERNAME: 'reader', PAGE_PASSWORD: 'fixture-password' };
const PAGE_AUTH = { authorization: `Basic ${btoa('reader:fixture-password')}` };

const testEnv: Env = { ...(env as unknown as Env), BOUND: echoBinding(), ...PAGE };

function get(path: string, init?: RequestInit): Promise<Response> {
  return router.fetch(new Request(`https://servant.bible${path}`, init), testEnv);
}

describe('www.servant.bible (ADR 0002)', () => {
  it('redirects to the https apex with the path and query intact, keeping the method', async () => {
    const response = await router.fetch(
      new Request('http://www.servant.bible/org/uw/server/alpha/mcp?x=1', {
        method: 'POST',
        body: '{}',
      }),
      testEnv
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://servant.bible/org/uw/server/alpha/mcp?x=1'
    );
  });
});

describe('/mcp and /mcp.json', () => {
  it('gives a browser with the page credential the page', async () => {
    const response = await get('/mcp', {
      headers: { accept: 'text/html,application/xhtml+xml', ...PAGE_AUTH },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Servant.Bible');
  });

  it('gives a program the list as JSON', async () => {
    const response = await get('/mcp', { headers: { accept: 'application/json' } });

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      $schema: SCHEMA_URL,
      entries: fixtureRegistry.entries,
    });
  });

  it('defaults to JSON when no Accept header is sent', async () => {
    const response = await get('/mcp');

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('serves /mcp.json as JSON even to a browser', async () => {
    const response = await get('/mcp.json', { headers: { accept: 'text/html' } });

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ $schema: SCHEMA_URL });
  });

  it('answers 405 to anything but GET and HEAD', async () => {
    const response = await get('/mcp', { method: 'POST', body: '{}' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(await response.json()).toEqual({ error: 'method not allowed' });
  });
});

describe('/servers.schema.json and /health', () => {
  it('serves the schema the list points at', async () => {
    const response = await get('/servers.schema.json');

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(SCHEMA);
  });

  it('reports the version and the number of servers it routes', async () => {
    const response = await get('/health');

    expect(await response.json()).toEqual({
      status: 'healthy',
      version: APP_VERSION,
      environment: 'production',
      servers: FIXTURE_ROUTABLE,
    });
  });
});

describe('forwarding end to end', () => {
  it('forwards a shorthand POST to the current backend', async () => {
    const response = await get('/s/alpha', { method: 'POST', body: '{"jsonrpc":"2.0"}' });
    const seen = (await response.json()) as Echo;

    expect(seen.url).toBe('https://alpha-v2.example/v2/mcp');
    expect(seen.body).toBe('{"jsonrpc":"2.0"}');
    expect(seen.via).toBe('fetch');
  });

  it('uses a binding from env when the version names one', async () => {
    const response = await get('/org/uw/server/bound/mcp', { method: 'POST', body: '{}' });
    const seen = (await response.json()) as Echo;

    expect(seen.via).toBe('binding');
  });

  it('refuses a retired server with 410', async () => {
    const response = await get('/org/uw/server/old/mcp');

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'gone', status: 'retired' });
  });

  it('refuses a planned server with 404 and says why', async () => {
    const response = await get('/org/uw/server/soon/mcp');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not routed', status: 'planned' });
  });

  it('never forwards a guess', async () => {
    const response = await get('/org/nobody/server/none/mcp', { method: 'POST', body: '{}' });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not found' });
  });
});
