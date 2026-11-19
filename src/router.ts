import { forward } from './forward.js';
import { APP_VERSION } from './generated/version.js';
import { json } from './http.js';
import { listBody, wantsHtml } from './list.js';
import { routableCount, type Registry } from './registry.js';
import { resolveTarget } from './resolve.js';
import { parseRoute, type Route, type ServerRoute, type ShorthandRoute } from './routes.js';

/**
 * The router (ADR 0003, decision 4): the page at `/`, the standard at
 * `/standard` (ADR 0008), the list at `/mcp` and `/mcp.json`, and forwarding
 * for `/org/...` and `/s/...`. Every address is public and the router holds
 * no secret (ADR 0010). Built from its dependencies so tests can hand it a
 * fixture registry and stub backends; index.ts builds the real one from
 * servers.json.
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

/** One request's worth of context, so the handlers stay under the parameter cap. */
interface Ctx {
  deps: RouterDeps;
  env: Env;
  request: Request;
  url: URL;
}

const READ_METHODS = ['GET', 'HEAD'];
/** The generated standard, as the generator names it beside index.html (ADR 0008). */
const STANDARD_ASSET = '/standard.html';

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

function methodNotAllowed(allow: string): Response {
  return json({ error: 'method not allowed' }, 405, { allow });
}

function readOnly(request: Request, produce: Produce): Response | Promise<Response> {
  if (!READ_METHODS.includes(request.method)) return methodNotAllowed('GET, HEAD');
  return produce();
}

function health({ deps, env }: Ctx): Response {
  return json({
    status: 'healthy',
    version: APP_VERSION,
    environment: env.ENVIRONMENT,
    servers: routableCount(deps.registry),
  });
}

/**
 * A page from the asset layer, to everyone (ADR 0010, decision 1): the page
 * as `/` whatever the request path was, or the standard. Callers apply
 * `readOnly` first, so the method is GET or HEAD and is kept: a HEAD has no
 * body. The request's headers go with it, so a conditional request is
 * answered `304`, and the asset layer's caching headers come back untouched
 * (decision 5).
 */
function page({ env, request, url }: Ctx, pagePath = '/'): Promise<Response> {
  return env.ASSETS.fetch(
    new Request(new URL(pagePath, url), { method: request.method, headers: request.headers })
  );
}

/** The same response naming `Accept` in `Vary`, beside whatever it already names. */
function varyingOnAccept(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.append('vary', 'Accept');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * `/mcp.json` is always the list. `/mcp` is the page to a request that
 * accepts HTML and the list to everything else, so both of its answers vary
 * on `Accept` (ADR 0010, decision 6).
 */
function list(ctx: Ctx, explicitJson: boolean): Response | Promise<Response> {
  return readOnly(ctx.request, async () => {
    if (explicitJson) return json(listBody(ctx.deps.registry));
    if (wantsHtml(ctx.request)) return varyingOnAccept(await page(ctx));
    return json(listBody(ctx.deps.registry), 200, { vary: 'Accept' });
  });
}

function server(ctx: Ctx, route: ServerRoute | ShorthandRoute): Promise<Response> {
  const { deps, env, request, url } = ctx;
  const resolution = resolveTarget(deps.registry, route, url.search);
  if (!resolution.ok) return Promise.resolve(json(resolution.body, resolution.status));
  return forward(request, resolution.target, {
    fetch: deps.fetch,
    binding: (name) => bindingIn(env, name),
  });
}

/** The fixed addresses; undefined for a route this function does not own. */
function fixed(route: Route, ctx: Ctx): Response | Promise<Response> | undefined {
  switch (route.kind) {
    case 'page':
      return readOnly(ctx.request, () => page(ctx));
    case 'standard':
      return readOnly(ctx.request, () => page(ctx, STANDARD_ASSET));
    case 'health':
      return readOnly(ctx.request, () => health(ctx));
    case 'schema':
      return readOnly(ctx.request, () => json(ctx.deps.schema));
    case 'list':
      return list(ctx, route.json);
    default:
      return undefined;
  }
}

export function createRouter(deps: RouterDeps): Router {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.hostname.startsWith('www.')) return redirectToApex(url);
      const route = parseRoute(url.pathname);
      const ctx: Ctx = { deps, env, request, url };
      if (route.kind === 'server' || route.kind === 'shorthand') return server(ctx, route);
      return fixed(route, ctx) ?? json({ error: 'not found' }, 404);
    },
  };
}
