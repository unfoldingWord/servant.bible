import type { Entry, Registry } from '../../src/registry.js';

/**
 * A registry with one entry per rule the router has to handle. Backends are
 * `.example` hosts that are never fetched: the forwarding tests inject a stub
 * fetch that echoes what arrived.
 */

export const ECHO_SESSION = 'sess-fixture';

function entry(overrides: Partial<Entry> & Pick<Entry, 'org' | 'server'>): Entry {
  return {
    kind: 'server',
    status: 'available',
    name: `${overrides.org}/${overrides.server}`,
    description: 'Fixture entry.',
    purpose: 'Router tests.',
    operator: { name: 'Fixture' },
    ...overrides,
  };
}

export const fixtureRegistry: Registry = {
  entries: [
    entry({
      org: 'uw',
      server: 'alpha',
      shorthand: 'alpha',
      current: 'v2',
      versions: {
        v1: { backend: 'https://alpha.example/api/mcp', transport: 'json-rpc' },
        v2: { backend: 'https://alpha-v2.example/v2/mcp', transport: 'streamable-http' },
      },
    }),
    entry({
      org: 'uw',
      server: 'bound',
      current: 'v1',
      versions: {
        v1: { backend: 'https://bound.example/mcp', transport: 'json-rpc', binding: 'BOUND' },
      },
    }),
    entry({
      org: 'uw',
      server: 'shaky',
      status: 'degraded',
      current: 'v1',
      versions: { v1: { backend: 'https://shaky.example/mcp', transport: 'json-rpc' } },
    }),
    entry({ org: 'uw', server: 'soon', status: 'planned' }),
    entry({ org: 'uw', server: 'old', shorthand: 'old', status: 'retired' }),
    entry({ org: 'uw', server: 'data', kind: 'dataset', status: 'planned' }),
    entry({
      org: 'other',
      server: 'alpha',
      current: 'v1',
      versions: { v1: { backend: 'https://other-alpha.example/mcp', transport: 'json-rpc' } },
    }),
  ],
};

/** The number of fixture entries the router forwards to: available or degraded servers. */
export const FIXTURE_ROUTABLE = 4;

/** Answers every request with a JSON description of what arrived. */
export async function echo(request: Request, via = 'fetch'): Promise<Response> {
  const body = await request.text();
  const headers = Object.fromEntries(request.headers);
  const seen = {
    via,
    method: request.method,
    url: request.url,
    redirect: request.redirect,
    headers,
    body,
  };
  return new Response(JSON.stringify(seen), {
    headers: {
      'content-type': 'application/json',
      'mcp-session-id': ECHO_SESSION,
      'x-upstream': via,
    },
  });
}

export interface Echo {
  via: string;
  method: string;
  url: string;
  redirect: string;
  headers: Record<string, string>;
  body: string;
}

/** A stand-in for a service binding: a Fetcher that echoes, tagged `binding`. */
export function echoBinding(): Fetcher {
  return {
    fetch: (input: RequestInfo | URL) => echo(new Request(input), 'binding'),
  } as unknown as Fetcher;
}
