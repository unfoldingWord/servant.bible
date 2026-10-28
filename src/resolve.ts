import {
  findByShorthand,
  findEntry,
  versionOf,
  type Entry,
  type Registry,
  type Version,
} from './registry.js';
import { parseRoute, type ServerRoute, type ShorthandRoute } from './routes.js';

/**
 * Turn a parsed server or shorthand route into the backend address to forward
 * to, or a refusal. Which entries are routed is ADR 0005, decision 2; how the
 * prefix is stripped is ADR 0003, decision 9:
 *
 *   - `<rest>` of `/mcp` (or empty) is the backend URL itself.
 *   - `<rest>` of `/mcp/...` is the backend URL plus what follows `/mcp`.
 *   - any other `<rest>` is served from the directory that holds the
 *     backend's `/mcp`: backend `https://h/api/mcp` + `/health` is
 *     `https://h/api/health`. Servers never see their Servant.Bible path.
 */

export interface Target {
  org: string;
  server: string;
  versionKey: string;
  version: Version;
  url: URL;
}

export type Resolution =
  { ok: true; target: Target } | { ok: false; status: 404 | 410; body: Record<string, string> };

const NOT_FOUND: Resolution = { ok: false, status: 404, body: { error: 'not found' } };

function refusalFor(entry: Entry): Resolution | undefined {
  if (entry.kind === 'dataset') {
    return { ok: false, status: 404, body: { error: 'not routed', kind: 'dataset' } };
  }
  if (entry.status === 'retired') {
    return { ok: false, status: 410, body: { error: 'gone', status: 'retired' } };
  }
  if (entry.status === 'planned') {
    return { ok: false, status: 404, body: { error: 'not routed', status: 'planned' } };
  }
  return undefined;
}

function upstreamUrl(backend: string, rest: string, search: string): URL {
  const url = new URL(backend);
  const path = rest === '' ? '/mcp' : rest;
  if (path.startsWith('/mcp/')) {
    url.pathname += path.slice('/mcp'.length);
  } else if (path !== '/mcp') {
    url.pathname = url.pathname.replace(/\/[^/]*$/, '') + path;
  }
  url.search = search;
  return url;
}

function resolveServer(registry: Registry, route: ServerRoute, search: string): Resolution {
  const entry = findEntry(registry, route.org, route.server);
  if (entry === undefined) return NOT_FOUND;
  const refusal = refusalFor(entry);
  if (refusal !== undefined) return refusal;
  const versionKey = route.version ?? entry.current;
  const version = versionKey === undefined ? undefined : versionOf(entry, versionKey);
  if (versionKey === undefined || version === undefined) return NOT_FOUND;
  const url = upstreamUrl(version.backend, route.rest, search);
  return { ok: true, target: { org: entry.org, server: entry.server, versionKey, version, url } };
}

export function resolveTarget(
  registry: Registry,
  route: ServerRoute | ShorthandRoute,
  search: string
): Resolution {
  if (route.kind === 'server') return resolveServer(registry, route, search);
  const entry = findByShorthand(registry, route.shorthand);
  if (entry === undefined) return NOT_FOUND;
  // The shorthand is an alias of the canonical prefix (ADR 0002), so rewrite
  // and parse again: `/s/x/v1/mcp` pins v1 exactly as the long form does.
  const canonical = parseRoute(`/org/${entry.org}/server/${entry.server}${route.rest}`);
  if (canonical.kind !== 'server') return NOT_FOUND;
  return resolveServer(registry, canonical, search);
}
