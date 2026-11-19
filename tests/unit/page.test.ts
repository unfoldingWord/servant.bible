import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import servers from '../../servers.json';
import { SCHEMA_URL } from '../../src/list.js';
import { createRouter, type Env } from '../../src/router.js';
import { echo, fixtureRegistry } from './fixtures.js';

/**
 * The generated page as the Worker serves it: the real public/index.html
 * (written by pretest) through the real ASSETS binding. The page is public
 * (ADR 0010): no request here carries a credential, and none is asked for.
 */

const router = createRouter({
  registry: fixtureRegistry,
  schema: { $id: SCHEMA_URL },
  fetch: (r) => echo(r),
});
const testEnv = env as unknown as Env;
const HTML = { accept: 'text/html' };
/** The three addresses that answer a page (ADR 0010, decision 1). */
const PAGES: [string, Record<string, string>][] = [
  ['/', {}],
  ['/mcp', HTML],
  ['/standard', {}],
];

function get(path: string, init?: RequestInit): Promise<Response> {
  return router.fetch(new Request(`https://servant.bible${path}`, init), testEnv);
}

describe('the page the Worker serves', () => {
  it('lists every entry in servers.json at /, to a request with no credential', async () => {
    const response = await get('/');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    for (const item of servers.entries) {
      expect(html).toContain(`data-entry="${item.org}/${item.server}"`);
    }
  });

  it('serves the same page to a browser at /mcp', async () => {
    const [root, mcp] = await Promise.all([get('/'), get('/mcp', { headers: HTML })]);

    expect(mcp.status).toBe(200);
    expect(await mcp.text()).toBe(await root.text());
  });

  it('answers HEAD with the headers and no body', async () => {
    const response = await get('/', { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('');
  });

  it('refuses a write with 405 and never turns it into a read', async () => {
    const response = await get('/', { method: 'POST', body: 'x' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});

describe('the page is public (ADR 0010)', () => {
  it.each(PAGES)('%s sets no cookie and offers no sign-out', async (path, headers) => {
    const response = await get(path, { headers });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('www-authenticate')).toBeNull();
    const html = await response.text();
    expect(html).not.toContain('sign-out');
    expect(html).not.toContain('sign-in');
  });

  // Decision 5: the gate's `private, no-store` is gone and the asset layer's
  // own headers pass through, so a browser revalidates by ETag.
  it.each(PAGES)('%s keeps the asset layer’s caching headers', async (path, headers) => {
    const response = await get(path, { headers });

    expect(response.headers.get('cache-control') ?? '').not.toContain('no-store');
    expect(response.headers.get('cache-control') ?? '').not.toContain('private');
    const etag = response.headers.get('etag');
    expect(etag).toBeTruthy();

    const again = await get(path, { headers: { ...headers, 'if-none-match': etag ?? '' } });
    expect(again.status).toBe(304);
  });

  // Decision 7: a cookie or a Basic header left over from the gate changes nothing.
  it('ignores a leftover page cookie and a leftover Basic header', async () => {
    const response = await get('/', {
      headers: { cookie: 'servant_bible_page=123.abc', authorization: 'Basic d3Jvbmc6d3Jvbmc=' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    ['GET', '/sign-in'],
    ['POST', '/sign-in'],
    ['GET', '/sign-out'],
    ['POST', '/sign-out'],
    ['GET', '/sign-in.html'],
    ['GET', '/sign-in-failed.html'],
  ])('%s %s answers 404: the address no longer exists', async (method, path) => {
    const response = await get(path, { method });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not found' });
  });
});

describe('the standard the Worker serves (ADR 0008)', () => {
  it('serves the generated standard at /standard and nowhere else', async () => {
    const [standard, direct, head] = await Promise.all([
      get('/standard'),
      get('/standard.html'),
      get('/standard', { method: 'HEAD' }),
    ]);

    expect(standard.status).toBe(200);
    const html = await standard.text();
    expect(html).toContain('<h1>The MCP server standard, v0.1</h1>');
    expect(html).toContain('<strong>Has clearly defined tools:</strong>');
    expect(html).toContain('href="https://github.com/unfoldingWord/servant.bible/issues/new"');
    expect(direct.status).toBe(404);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
