import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import servers from '../../servers.json';
import { SCHEMA_URL } from '../../src/list.js';
import { createRouter, type Env } from '../../src/router.js';
import { echo, fixtureRegistry } from './fixtures.js';

/**
 * The generated page as the Worker serves it: the real public/index.html
 * (written by pretest) through the real ASSETS binding, behind the gate with
 * the fixture credential (ADR 0006). router.test.ts covers the gate's
 * answers; this file covers what a reader who gets past it sees (#9).
 */

const router = createRouter({
  registry: fixtureRegistry,
  schema: { $id: SCHEMA_URL },
  fetch: (r) => echo(r),
});
const PAGE = {
  PAGE_USERNAME: 'reader',
  PAGE_PASSWORD: 'fixture-password',
  PAGE_COOKIE_SECRET: 'fixture-cookie-secret',
};
const AUTH = { authorization: `Basic ${btoa('reader:fixture-password')}` };
const PAGE_FORM = { username: 'reader', password: 'fixture-password' };
const testEnv: Env = { ...(env as unknown as Env), ...PAGE };

function get(path: string, init?: RequestInit): Promise<Response> {
  return router.fetch(new Request(`https://servant.bible${path}`, init), testEnv);
}

/** The cookie a sign-in sets, as a request sends it back. */
async function signedInCookie(): Promise<string | undefined> {
  const response = await get('/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(PAGE_FORM).toString(),
  });
  return response.headers.get('set-cookie')?.split(';')[0];
}

describe('the page the Worker serves', () => {
  it('lists every entry in servers.json at /', async () => {
    const response = await get('/', { headers: AUTH });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    for (const item of servers.entries) {
      expect(html).toContain(`data-entry="${item.org}/${item.server}"`);
    }
  });

  it('serves the same page to a browser at /mcp', async () => {
    const [root, mcp] = await Promise.all([
      get('/', { headers: AUTH }),
      get('/mcp', { headers: { accept: 'text/html', ...AUTH } }),
    ]);

    expect(await mcp.text()).toBe(await root.text());
  });
});

describe('the sign-in the Worker serves (ADR 0007)', () => {
  it('lists every entry to the cookie a sign-in sets, and offers sign-out', async () => {
    const signedIn = await get('/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(PAGE_FORM).toString(),
    });
    expect(signedIn.status).toBe(303);
    const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const response = await get('/', { headers: { cookie } });

    expect(response.status).toBe(200);
    const html = await response.text();
    for (const item of servers.entries) {
      expect(html).toContain(`data-entry="${item.org}/${item.server}"`);
    }
    expect(html).toContain('action="/sign-out"');
  });

  it('serves the generated sign-in page at /sign-in and as the 401 body', async () => {
    const [page, refused] = await Promise.all([
      get('/sign-in'),
      get('/', { headers: { accept: 'text/html' } }),
    ]);

    expect(page.status).toBe(200);
    expect(refused.status).toBe(401);
    const html = await page.text();
    expect(html).toContain('action="/sign-in"');
    expect(await refused.text()).toBe(html);
  });

  it('answers HEAD with the headers and no body', async () => {
    const response = await get('/', { method: 'HEAD', headers: AUTH });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('');
  });
});

describe('the standard the Worker serves (ADR 0008)', () => {
  it('serves the generated standard at /standard and nowhere else', async () => {
    const cookie = (await signedInCookie()) ?? '';
    const [standard, direct, head] = await Promise.all([
      get('/standard', { headers: { cookie } }),
      get('/standard.html', { headers: { cookie } }),
      get('/standard', { method: 'HEAD', headers: AUTH }),
    ]);

    expect(standard.status).toBe(200);
    const html = await standard.text();
    expect(html).toContain('<h1>The MCP server standard, v0.1</h1>');
    expect(html).toContain('<strong>Has clearly defined tools:</strong>');
    expect(html).toContain('href="https://github.com/unfoldingWord/servant.bible/issues/new"');
    expect(html).toContain('action="/sign-out"');
    expect(direct.status).toBe(404);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
