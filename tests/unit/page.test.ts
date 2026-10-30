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
const PAGE = { PAGE_USERNAME: 'reader', PAGE_PASSWORD: 'fixture-password' };
const AUTH = { authorization: `Basic ${btoa('reader:fixture-password')}` };
const testEnv: Env = { ...(env as unknown as Env), ...PAGE };

function get(path: string, init?: RequestInit): Promise<Response> {
  return router.fetch(new Request(`https://servant.bible${path}`, init), testEnv);
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

  it('answers HEAD with the headers and no body', async () => {
    const response = await get('/', { method: 'HEAD', headers: AUTH });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('');
  });
});
