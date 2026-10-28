import { forward } from './forward.js';
import { APP_VERSION } from './generated/version.js';
import { json } from './http.js';
import { listBody, wantsHtml } from './list.js';
import { routableCount, type Registry } from './registry.js';
import { resolveTarget } from './resolve.js';
import { parseRoute, type ServerRoute, type ShorthandRoute } from './routes.js';

/**
 * The router (ADR 0003, decision 4): the page at `/`, the list at `/mcp` and
 * `/mcp.json`, and forwarding for `/org/...` and `/s/...`. Built from its
 * dependencies so tests can hand it a fixture registry and stub backends;
 * index.ts builds the real one from servers.json.
 */

export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  /** Service bindings named by `binding` in servers.json (ADR 0003, decision 8). */
  [binding: string]: unknown;
}

export interface RouterDeps {
  registry: Registry;
  /** The parsed servers.schema.json, served at /servers.schema.json. */
  schema: unknown;
  fetch(request: Request): Promise<Response>;
}

export interface Router {
  fetch(request: Request, env: Env): Promise<Response>;
}

const READ_METHODS = ['GET', 'HEAD'];

function isFetcher(value: unknown): value is Fetcher {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { fetch?: unknown }).fetch === 'function'
  );
}

function bindingIn(env: Env, name: string): Fetcher | undefined {
  const found = Object.entries(env).find(([key]) => key === name)?.[1];
  return isFetcher(found) ? found : undefined;
}

/** `www.` redirects to the https apex (ADR 0002). 308 keeps the method and body. */
function redirectToApex(url: URL): Response {
  const apex = new URL(url);
  apex.protocol = 'https:';
  apex.hostname = url.hostname.slice('www.'.length);
  return new Response(null, { status: 308, headers: { location: apex.toString() } });
}

type Produce = () => Response | Promise<Response>;

function readOnly(request: Request, produce: Produce): Response | Promise<Response> {
  if (!READ_METHODS.includes(request.method)) {
    return json({ error: 'method not allowed' }, 405, { allow: 'GET, HEAD' });
  }
  return produce();
}

function health(deps: RouterDeps, env: Env): Response {
  return json({
    status: 'healthy',
    version: APP_VERSION,
    environment: env.ENVIRONMENT,
    servers: routableCount(deps.registry),
  });
}

/** The page, fetched from the asset layer as `/` whatever the request path was. */
function page(env: Env, request: Request, url: URL): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
}

function list(
  deps: RouterDeps,
  env: Env,
  request: Request,
  url: URL,
  explicitJson: boolean
): Response | Promise<Response> {
  return readOnly(request, () => {
    if (!explicitJson && wantsHtml(request)) return page(env, request, url);
    return json(listBody(deps.registry));
  });
}

function server(
  deps: RouterDeps,
  env: Env,
  request: Request,
  url: URL,
  route: ServerRoute | ShorthandRoute
): Promise<Response> {
  const resolution = resolveTarget(deps.registry, route, url.search);
  if (!resolution.ok) return Promise.resolve(json(resolution.body, resolution.status));
  return forward(request, resolution.target, {
    fetch: deps.fetch,
    binding: (name) => bindingIn(env, name),
  });
}

export function createRouter(deps: RouterDeps): Router {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.hostname.startsWith('www.')) return redirectToApex(url);
      const route = parseRoute(url.pathname);
      switch (route.kind) {
        case 'page':
          return env.ASSETS.fetch(request);
        case 'health':
          return readOnly(request, () => health(deps, env));
        case 'schema':
          return readOnly(request, () => json(deps.schema));
        case 'list':
          return list(deps, env, request, url, route.json);
        case 'server':
        case 'shorthand':
          return server(deps, env, request, url, route);
        default:
          return json({ error: 'not found' }, 404);
      }
    },
  };
}
