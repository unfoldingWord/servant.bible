import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { SCHEMA_URL } from '../../src/list.js';
import { createRouter, type Env } from '../../src/router.js';
import { echo, echoBinding, fixtureRegistry } from './fixtures.js';

/**
 * The page gate (ADR 0006): `/` and the HTML view of `/mcp` need the shared
 * credential; nothing a program calls does. The credential comes from two
 * Worker secrets, so the tests build the env themselves rather than relying
 * on wrangler.toml, which must never carry it.
 */

const SCHEMA = { $id: SCHEMA_URL, title: 'fixture schema' };
const router = createRouter({ registry: fixtureRegistry, schema: SCHEMA, fetch: (r) => echo(r) });

const USERNAME = 'reader';
const PASSWORD = 'open sesame: ünïcode';

const base = { ...(env as unknown as Env), BOUND: echoBinding() };
const gated: Env = { ...base, PAGE_USERNAME: USERNAME, PAGE_PASSWORD: PASSWORD };
const unconfigured: Env = { ...base };

function basic(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

const BROWSER = { accept: 'text/html,application/xhtml+xml' };

function get(path: string, environment: Env, headers: Record<string, string> = {}) {
  return router.fetch(new Request(`https://servant.bible${path}`, { headers }), environment);
}

describe('the page gate (ADR 0006)', () => {
  it('asks a browser at / for the credential', async () => {
    const response = await get('/', gated, BROWSER);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe(
      'Basic realm="Servant.Bible", charset="UTF-8"'
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('asks the HTML view of /mcp for the credential too', async () => {
    const response = await get('/mcp', gated, BROWSER);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic');
  });

  it('serves the page to the right credential, marked private and uncacheable', async () => {
    const response = await get('/', gated, {
      ...BROWSER,
      authorization: basic(USERNAME, PASSWORD),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toContain('Servant.Bible');
  });

  it('serves the HTML view of /mcp to the right credential', async () => {
    const response = await get('/mcp', gated, {
      ...BROWSER,
      authorization: basic(USERNAME, PASSWORD),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});

describe('the page gate refuses everything but the credential (ADR 0006)', () => {
  it('refuses a wrong password, a wrong username, and a swapped pair', async () => {
    for (const [username, password] of [
      [USERNAME, 'wrong'],
      ['someone', PASSWORD],
      [PASSWORD, USERNAME],
      [USERNAME, `${PASSWORD} `],
      ['', ''],
    ]) {
      const response = await get('/', gated, {
        ...BROWSER,
        authorization: basic(username ?? '', password ?? ''),
      });
      expect(response.status).toBe(401);
    }
  });

  it('refuses a malformed Authorization header without throwing', async () => {
    for (const authorization of ['Basic', 'Basic not*base64', 'Bearer abc', 'Basic cmVhZGVy']) {
      const response = await get('/', gated, { ...BROWSER, authorization });
      expect(response.status).toBe(401);
    }
  });

  it('gates HEAD the same as GET', async () => {
    const response = await router.fetch(
      new Request('https://servant.bible/', { method: 'HEAD', headers: BROWSER }),
      gated
    );

    expect(response.status).toBe(401);
  });

  it('fails closed with 503 when the credential is not configured', async () => {
    const response = await get('/', unconfigured, {
      ...BROWSER,
      authorization: basic(USERNAME, PASSWORD),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'page gate not configured' });
  });

  it('fails closed when only one half of the credential is configured', async () => {
    const half: Env = { ...base, PAGE_USERNAME: USERNAME, PAGE_PASSWORD: '' };
    const response = await get('/', half, { ...BROWSER, authorization: basic(USERNAME, '') });

    expect(response.status).toBe(503);
  });
});

describe('everything a program calls stays open (ADR 0006, decision 1)', () => {
  it('serves /mcp.json, the JSON view of /mcp, the schema, and /health without a credential', async () => {
    const open = [
      get('/mcp.json', gated, BROWSER),
      get('/mcp', gated),
      get('/mcp', gated, { accept: 'application/json' }),
      get('/servers.schema.json', gated, BROWSER),
      get('/health', gated, BROWSER),
    ];
    for (const response of await Promise.all(open)) {
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
  });

  it("forwards a server call untouched: the caller's own bearer token still passes through", async () => {
    const response = await router.fetch(
      new Request('https://servant.bible/org/uw/server/alpha/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/html',
          authorization: 'Bearer caller-token',
        },
        body: '{}',
      }),
      gated
    );

    expect(response.status).toBe(200);
    const echoed = (await response.json()) as { headers: Record<string, string> };
    expect(echoed.headers['authorization']).toBe('Bearer caller-token');
  });

  it('serves the open paths even when the gate is not configured', async () => {
    const response = await get('/mcp.json', unconfigured);

    expect(response.status).toBe(200);
  });
});
