/**
 * The address grammar of ADR 0002, as a pure parse of the request path:
 *
 *   /                                              page
 *   /health                                        the router's own health
 *   /mcp, /mcp.json                                the list
 *   /servers.schema.json                           the list's schema
 *   /org/<org>/server/<server>[/v<n>][<rest>]      a server, optionally pinned
 *   /s/<shorthand>[<rest>]                         alias of the canonical prefix
 *
 * `rest` is everything after the prefix, starting with `/`, or empty when the
 * address is the bare prefix. Resolving `rest` against a backend is resolve.ts.
 */

export type Route =
  | { kind: 'page' }
  | { kind: 'health' }
  | { kind: 'list'; json: boolean }
  | { kind: 'schema' }
  | ServerRoute
  | ShorthandRoute
  | { kind: 'unknown' };

export interface ServerRoute {
  kind: 'server';
  org: string;
  server: string;
  version?: string;
  rest: string;
}

export interface ShorthandRoute {
  kind: 'shorthand';
  shorthand: string;
  rest: string;
}

const UNKNOWN: Route = { kind: 'unknown' };

const FIXED = new Map<string, Route>([
  ['/', { kind: 'page' }],
  ['/health', { kind: 'health' }],
  ['/mcp', { kind: 'list', json: false }],
  ['/mcp.json', { kind: 'list', json: true }],
  ['/servers.schema.json', { kind: 'schema' }],
]);

/** A version segment is exactly `v` and digits (the schema's version key rule). */
const VERSION = /^v[0-9]+$/;

function restOf(segments: string[]): string {
  return segments.length === 0 ? '' : `/${segments.join('/')}`;
}

function serverRoute(org: string | undefined, server: string | undefined, tail: string[]): Route {
  if (!org || !server) return UNKNOWN;
  const [first] = tail;
  if (first !== undefined && VERSION.test(first)) {
    return { kind: 'server', org, server, version: first, rest: restOf(tail.slice(1)) };
  }
  return { kind: 'server', org, server, rest: restOf(tail) };
}

function shorthandRoute(shorthand: string | undefined, tail: string[]): Route {
  if (!shorthand) return UNKNOWN;
  return { kind: 'shorthand', shorthand, rest: restOf(tail) };
}

export function parseRoute(pathname: string): Route {
  const fixed = FIXED.get(pathname);
  if (fixed !== undefined) return fixed;
  const segments = pathname.split('/').slice(1);
  if (segments[0] === 'org' && segments[2] === 'server') {
    return serverRoute(segments[1], segments[3], segments.slice(4));
  }
  if (segments[0] === 's') {
    return shorthandRoute(segments[1], segments.slice(2));
  }
  return UNKNOWN;
}
