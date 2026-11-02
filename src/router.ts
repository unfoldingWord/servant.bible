import { forward } from './forward.js';
import { gated, showSignIn, signIn, signOut, type GateEnv, type PageAssets } from './gate.js';
import { APP_VERSION } from './generated/version.js';
import { json } from './http.js';
import { listBody, wantsHtml } from './list.js';
import { routableCount, type Registry } from './registry.js';
import { resolveTarget } from './resolve.js';
import { parseRoute, type Route, type ServerRoute, type ShorthandRoute } from './routes.js';

/**
 * The router (ADR 0003, decision 4): the page at `/` with its sign-in and
 * sign-out (ADR 0007), the standard at `/standard` behind the same gate
 * (ADR 0008), the list at `/mcp` and `/mcp.json`, and forwarding for
 * `/org/...` and `/s/...`. Built from its dependencies so tests can hand
 * it a fixture registry and stub backends; index.ts builds the real one from
 * servers.json.
 */

export interface Env extends GateEnv {
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
 * The pages the gate answers with, from the asset layer: the gated page at
 * `pagePath` (the page as `/` whatever the request path was, or the
 * standard) and the two sign-in pages. HEAD stays HEAD so a refused HEAD has
 * no body; any other method fetches with GET, so a failed POST to /sign-in
 * can still show the form.
 */
function pageAssets({ env, request, url }: Ctx, pagePath = '/'): PageAssets {
  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  const asset = (path: string, headers?: Headers) =>
    env.ASSETS.fetch(
      new Request(new URL(path, url), { method, ...(headers === undefined ? {} : { headers }) })
    );
  return {
    page: () => asset(pagePath, request.headers),
    signIn: (failed) => asset(failed ? '/sign-in-failed.html' : '/sign-in.html'),
  };
}

/**
 * The page, behind the gate (ADR 0006, ADR 0007), or the standard behind the
 * same gate (ADR 0008). Callers apply `readOnly` first: a write is refused
 * before the credential is looked at, and never turned into a GET.
 */
function page(ctx: Ctx, pagePath = '/'): Promise<Response> {
  return gated(ctx.env, ctx.request, pageAssets(ctx, pagePath));
}

function list(ctx: Ctx, explicitJson: boolean): Response | Promise<Response> {
  return readOnly(ctx.request, () => {
    if (!explicitJson && wantsHtml(ctx.request)) return page(ctx);
    return json(listBody(ctx.deps.registry));
  });
}

function signInRoute(ctx: Ctx): Response | Promise<Response> {
  switch (ctx.request.method) {
    case 'GET':
    case 'HEAD':
      return showSignIn(ctx.env, pageAssets(ctx));
    case 'POST':
      return signIn(ctx.env, ctx.request, pageAssets(ctx));
    default:
      return methodNotAllowed('GET, HEAD, POST');
  }
}

function signOutRoute(ctx: Ctx): Response | Promise<Response> {
  if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
  return signOut(ctx.env, ctx.request);
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
    case 'sign-in':
      return signInRoute(ctx);
    case 'sign-out':
      return signOutRoute(ctx);
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
