import { json } from './http.js';
import { logForward } from './log.js';
import type { Target } from './resolve.js';

/**
 * Forward one request to its backend (ADR 0003, decisions 6 to 9): a proxy,
 * never a redirect. Method and body pass through; request headers pass
 * through except the hop-by-hop set and the caller's Host; the response keeps
 * the backend's status, headers, and body stream, so `text/event-stream`
 * bodies stream and `Mcp-Session-Id` comes back. No timeout is imposed: the
 * backends set their own, and BT Servant allows 30 s per tool call. No
 * credential is added.
 */

export interface ForwardDeps {
  /** Public fetch, used when the version names no binding. */
  fetch(request: Request): Promise<Response>;
  /** The service binding of that name, if the Worker has one. */
  binding(name: string): Fetcher | undefined;
}

type Send = (request: Request) => Promise<Response>;

/** RFC 9110 hop-by-hop headers, plus Host, which belongs to the backend. */
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
];

/**
 * Headers that describe the wire form of the body. The runtime decodes an
 * encoded upstream body but keeps these, and would re-encode on the way out
 * whatever the caller's Accept-Encoding said; dropping them sends the decoded
 * body as it is.
 */
const BODY_ENCODING = ['content-encoding', 'content-length'];

function connectionNamed(headers: Headers): string[] {
  return (headers.get('connection') ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');
}

function withoutHopByHop(source: Headers): Headers {
  const headers = new Headers(source);
  for (const name of [...HOP_BY_HOP, ...connectionNamed(source)]) headers.delete(name);
  return headers;
}

/** The backend's response for the caller: same status, body stream, and headers. */
function clientResponse(upstream: Response): Response {
  const headers = withoutHopByHop(upstream.headers);
  if (headers.has('content-encoding')) {
    for (const name of BODY_ENCODING) headers.delete(name);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function upstreamRequest(request: Request, target: Target): Request {
  return new Request(target.url, {
    method: request.method,
    headers: withoutHopByHop(request.headers),
    body: request.body,
    // A backend's redirect goes back to the caller untouched; following it
    // here would turn a POST into a GET on the caller's behalf.
    redirect: 'manual',
  });
}

function badGateway(reason: string): Response {
  return json({ error: 'bad gateway', reason }, 502);
}

function sender(target: Target, deps: ForwardDeps): Send | undefined {
  const name = target.version.binding;
  if (name === undefined) return deps.fetch;
  const fetcher = deps.binding(name);
  return fetcher === undefined ? undefined : (request) => fetcher.fetch(request);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The backend's response, or a 502 the router generated with the reason why. */
type Attempt = { response: Response; error?: string };

async function attempt(request: Request, target: Target, deps: ForwardDeps): Promise<Attempt> {
  const where = `${target.org}/${target.server} ${target.versionKey}`;
  const send = sender(target, deps);
  if (send === undefined) {
    console.error(
      `forward: binding "${target.version.binding}" named by ${where} is not configured`
    );
    return { response: badGateway('binding not configured'), error: 'binding not configured' };
  }
  try {
    return { response: await send(upstreamRequest(request, target)) };
  } catch (error) {
    console.error(`forward: ${where} unreachable: ${describe(error)}`);
    return { response: badGateway('upstream unreachable'), error: 'upstream unreachable' };
  }
}

/**
 * Every attempt, including a 502 the router generated, writes the structured
 * line, so request counts and error rates per server cover outages too.
 */
export async function forward(
  request: Request,
  target: Target,
  deps: ForwardDeps
): Promise<Response> {
  const started = Date.now();
  const { response, error } = await attempt(request, target, deps);
  logForward({
    org: target.org,
    server: target.server,
    version: target.versionKey,
    method: request.method,
    upstream_status: response.status,
    duration_ms: Date.now() - started,
    ...(error === undefined ? {} : { error }),
  });
  return error === undefined ? clientResponse(response) : response;
}
