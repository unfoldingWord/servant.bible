import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { COOKIE_NAME } from '../../src/cookie.js';
import { SCHEMA_URL } from '../../src/list.js';
import { createRouter, type Env } from '../../src/router.js';
import { signToken } from '../../src/token.js';
import { echo, echoBinding, fixtureRegistry } from './fixtures.js';

/**
 * The page gate (ADR 0006, amended by ADR 0007): `/` and the HTML view of
 * `/mcp` need the shared credential, presented once through the sign-in page
 * and remembered by a signed cookie, or on every request as a Basic header;
 * nothing a program calls does. The three secrets come from the deploy
 * workflows, so the tests build the env themselves rather than relying on
 * wrangler.toml, which must never carry them.
 */

const SCHEMA = { $id: SCHEMA_URL, title: 'fixture schema' };
const router = createRouter({ registry: fixtureRegistry, schema: SCHEMA, fetch: (r) => echo(r) });

const USERNAME = 'reader';
const PASSWORD = 'open sesame: ünïcode';
const SECRET = 'fixture-cookie-secret-0123456789abcdef';
const CREDENTIAL = `${USERNAME}:${PASSWORD}`;

const base = { ...(env as unknown as Env), BOUND: echoBinding() };
const gated: Env = {
  ...base,
  PAGE_USERNAME: USERNAME,
  PAGE_PASSWORD: PASSWORD,
  PAGE_COOKIE_SECRET: SECRET,
};
const unconfigured: Env = { ...base };

const BROWSER = { accept: 'text/html,application/xhtml+xml' };
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const COOKIE_ATTRIBUTES = '; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax';

function basic(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

function get(path: string, environment: Env, headers: Record<string, string> = {}) {
  return router.fetch(new Request(`https://servant.bible${path}`, { headers }), environment);
}

function head(path: string, environment: Env, headers: Record<string, string> = {}) {
  return router.fetch(
    new Request(`https://servant.bible${path}`, { method: 'HEAD', headers }),
    environment
  );
}

function post(
  path: string,
  environment: Env,
  body: Record<string, string> | string,
  headers: Record<string, string> = FORM
) {
  const encoded = typeof body === 'string' ? body : new URLSearchParams(body).toString();
  return router.fetch(
    new Request(`https://servant.bible${path}`, { method: 'POST', headers, body: encoded }),
    environment
  );
}

/** The cookie a successful sign-in sets, as a request would send it back. */
async function signedIn(environment: Env = gated): Promise<string> {
  const response = await post('/sign-in', environment, { username: USERNAME, password: PASSWORD });
  const set = response.headers.get('set-cookie') ?? '';
  return set.split(';')[0] ?? '';
}

async function cookieFor(credential: string, expiresAt: number, secret = SECRET): Promise<string> {
  return `${COOKIE_NAME}=${await signToken(secret, credential, expiresAt)}`;
}

const NOW_SECONDS = () => Math.floor(Date.now() / 1000);

describe('a browser without a cookie meets the sign-in page (ADR 0007, decision 1)', () => {
  it('answers 401 with the sign-in page and no WWW-Authenticate at /', async () => {
    const response = await get('/', gated, BROWSER);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBeNull();
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const html = await response.text();
    expect(html).toContain('action="/sign-in"');
    expect(html).not.toContain('class="form-error"');
  });

  it('answers the HTML view of /mcp the same way', async () => {
    const response = await get('/mcp', gated, BROWSER);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBeNull();
    expect(await response.text()).toContain('action="/sign-in"');
  });

  it('answers HEAD / with the headers and no body', async () => {
    const response = await head('/', gated, BROWSER);

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('');
  });

  it('serves the sign-in page itself at GET /sign-in', async () => {
    const response = await get('/sign-in', gated, BROWSER);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toContain('action="/sign-in"');
  });

  it('refuses any method but GET, HEAD, and POST on /sign-in', async () => {
    const response = await router.fetch(
      new Request('https://servant.bible/sign-in', { method: 'PUT', headers: FORM, body: 'a=1' }),
      gated
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD, POST');
  });
});

describe('signing in (ADR 0007, decisions 2 and 3)', () => {
  it('sets the cookie and redirects to / on the right credential', async () => {
    const response = await post('/sign-in', gated, { username: USERNAME, password: PASSWORD });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(new RegExp(`^${COOKIE_NAME}=[0-9]+\\.[A-Za-z0-9_-]{43}; `));
    expect(cookie.endsWith(COOKIE_ATTRIBUTES)).toBe(true);
    const expiry = Number(cookie.slice(COOKIE_NAME.length + 1).split('.')[0]);
    expect(expiry - NOW_SECONDS()).toBeGreaterThan(2592000 - 60);
    expect(expiry - NOW_SECONDS()).toBeLessThanOrEqual(2592000);
  });

  it('answers 401 with the failed sign-in page and no cookie on a wrong credential', async () => {
    const wrong = [
      { username: USERNAME, password: 'wrong' },
      { username: 'someone', password: PASSWORD },
      { username: PASSWORD, password: USERNAME },
      { username: USERNAME, password: `${PASSWORD} ` },
      { username: '', password: '' },
      { username: USERNAME },
      {},
    ];
    for (const form of wrong) {
      const response = await post('/sign-in', gated, form);
      expect(response.status, JSON.stringify(form)).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('www-authenticate')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.text()).toContain('class="form-error"');
    }
  });
});

describe('what the form must be (ADR 0007, decision 2)', () => {
  it('ignores a Basic header on the form: the form is what counts', async () => {
    const response = await post(
      '/sign-in',
      gated,
      { username: USERNAME, password: 'wrong' },
      { ...FORM, authorization: basic(USERNAME, PASSWORD) }
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('refuses a body that is not a form, or is too large, before any comparison', async () => {
    const json = await post('/sign-in', gated, '{"username":"reader"}', {
      'content-type': 'application/json',
    });
    expect(json.status).toBe(415);

    const large = await post('/sign-in', gated, {
      username: USERNAME,
      password: 'x'.repeat(5000),
    });
    expect(large.status).toBe(413);
  });
});

describe('the cookie opens the page (ADR 0007, decision 3)', () => {
  it('serves / and the HTML view of /mcp to the cookie a sign-in set', async () => {
    const cookie = await signedIn();
    const [root, mcp] = await Promise.all([
      get('/', gated, { ...BROWSER, cookie }),
      get('/mcp', gated, { ...BROWSER, cookie }),
    ]);

    expect(root.status).toBe(200);
    expect(root.headers.get('content-type')).toContain('text/html');
    expect(root.headers.get('cache-control')).toBe('private, no-store');
    expect(root.headers.get('set-cookie')).toBeNull();
    expect(mcp.status).toBe(200);
    expect(await root.text()).toContain('Servant.Bible');
  });

  it('finds the cookie among others and serves HEAD / as HEAD', async () => {
    const cookie = `theirs=1; ${await signedIn()}; other=2`;
    const response = await head('/', gated, { ...BROWSER, cookie });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('refuses a tampered, expired, foreign, or rotated-away cookie', async () => {
    const good = await signedIn();
    const tampered = good.endsWith('A') ? `${good.slice(0, -1)}B` : `${good.slice(0, -1)}A`;
    const refused = [
      tampered,
      await cookieFor(CREDENTIAL, NOW_SECONDS() - 1),
      await cookieFor(CREDENTIAL, NOW_SECONDS() + 60, 'another-secret'),
      await cookieFor(`${USERNAME}:rotated`, NOW_SECONDS() + 60),
      `${COOKIE_NAME}=`,
      `${COOKIE_NAME}=garbage`,
    ];
    for (const cookie of refused) {
      const response = await get('/', gated, { ...BROWSER, cookie });
      expect(response.status, cookie).toBe(401);
      expect(await response.text()).toContain('action="/sign-in"');
    }
  });
});

describe('signing out (ADR 0007, decision 2)', () => {
  it('clears the cookie and redirects to /', async () => {
    const cookie = await signedIn();
    const response = await post('/sign-out', gated, {}, { ...FORM, cookie });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('set-cookie')).toBe(
      `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('answers POST only', async () => {
    const response = await get('/sign-out', gated, BROWSER);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});

describe('Basic authentication still works for scripts (ADR 0007, decision 5)', () => {
  it('serves the page to the right header without setting a cookie', async () => {
    const response = await get('/', gated, {
      ...BROWSER,
      authorization: basic(USERNAME, PASSWORD),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('refuses a wrong or malformed header with the sign-in page, never a challenge', async () => {
    const headers = [
      basic(USERNAME, 'wrong'),
      basic('someone', PASSWORD),
      basic(PASSWORD, USERNAME),
      basic('', ''),
      'Basic',
      'Basic not*base64',
      'Bearer abc',
      'Basic cmVhZGVy',
    ];
    for (const authorization of headers) {
      const response = await get('/', gated, { ...BROWSER, authorization });
      expect(response.status, authorization).toBe(401);
      expect(response.headers.get('www-authenticate')).toBeNull();
      expect(await response.text()).toContain('action="/sign-in"');
    }
  });

  it('refuses a write to / with 405 before looking at any credential', async () => {
    const response = await router.fetch(
      new Request('https://servant.bible/', { method: 'POST', headers: BROWSER, body: '{}' }),
      gated
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});

describe('the gate fails closed (ADR 0007, decision 7)', () => {
  const missing: [string, Env][] = [
    ['everything', unconfigured],
    ['the username', { ...gated, PAGE_USERNAME: '' }],
    ['the password', (({ PAGE_PASSWORD: _omitted, ...rest }) => rest)(gated)],
    ['the cookie secret', { ...gated, PAGE_COOKIE_SECRET: '' }],
  ];

  it.each(missing)('answers 503 on every gated path when %s is missing', async (_, environment) => {
    const responses = await Promise.all([
      get('/', environment, { ...BROWSER, authorization: basic(USERNAME, PASSWORD) }),
      get('/mcp', environment, BROWSER),
      get('/sign-in', environment, BROWSER),
      post('/sign-in', environment, { username: USERNAME, password: PASSWORD }),
      post('/sign-out', environment, {}),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(await response.json()).toEqual({ error: 'page gate not configured' });
    }
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
});

describe('a cookie changes nothing for a program (ADR 0007, decisions 6 and 8)', () => {
  it('serves the open paths the same with a cookie present', async () => {
    const cookie = await signedIn();
    const open = [get('/mcp.json', gated, { cookie }), get('/health', gated, { cookie })];
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

  it('never sends the page cookie upstream, and keeps any other cookie (ADR 0007, decision 6)', async () => {
    const response = await router.fetch(
      new Request('https://servant.bible/org/uw/server/alpha/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `theirs=1; ${await signedIn()}` },
        body: '{}',
      }),
      gated
    );

    const echoed = (await response.json()) as { headers: Record<string, string> };
    expect(echoed.headers['cookie']).toBe('theirs=1');
  });

  it('serves the open paths even when the gate is not configured', async () => {
    const response = await get('/mcp.json', unconfigured);

    expect(response.status).toBe(200);
  });
});
