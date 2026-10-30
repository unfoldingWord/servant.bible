import { json } from './http.js';
import { logPageGateUnconfigured } from './log.js';

/**
 * The page gate (ADR 0006): one shared username and password, by HTTP Basic
 * authentication, in front of the page only. The credential is two Worker
 * secrets that the deploy workflows set; wrangler.toml never carries them.
 * The gate fails closed: no credential configured means no page, not an open
 * page. A program never meets this code, because only the page routes call it.
 */

export interface PageCredential {
  username: string;
  password: string;
}

export interface GateEnv {
  PAGE_USERNAME?: string;
  PAGE_PASSWORD?: string;
}

const NO_STORE = { 'cache-control': 'private, no-store' };
const CHALLENGE = 'Basic realm="Servant.Bible", charset="UTF-8"';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Both halves present and non-empty, or no credential at all. */
export function pageCredential(env: GateEnv): PageCredential | undefined {
  if (!nonEmpty(env.PAGE_USERNAME) || !nonEmpty(env.PAGE_PASSWORD)) return undefined;
  return { username: env.PAGE_USERNAME, password: env.PAGE_PASSWORD };
}

/** The `user:pass` a Basic header carries, as UTF-8, or undefined when malformed. */
function presented(request: Request): string | undefined {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'basic' || !encoded || rest.length > 0) return undefined;
  if (!BASE64.test(encoded) || encoded.length % 4 !== 0) return undefined;
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Constant-time equality of two strings, as the UTF-8 bytes they encode. */
function sameSecret(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}

export function authorized(request: Request, credential: PageCredential): boolean {
  const given = presented(request);
  if (given === undefined) return false;
  return sameSecret(given, `${credential.username}:${credential.password}`);
}

/** The page response, marked so no shared cache keeps what the gate protects. */
function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', NO_STORE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

type ProducePage = () => Promise<Response>;

/** Runs `producePage` only for a request that carries the page credential. */
export async function gated(env: GateEnv, request: Request, producePage: ProducePage) {
  const credential = pageCredential(env);
  if (credential === undefined) {
    logPageGateUnconfigured();
    return json({ error: 'page gate not configured' }, 503, NO_STORE);
  }
  if (!authorized(request, credential)) {
    return json({ error: 'unauthorized' }, 401, { ...NO_STORE, 'www-authenticate': CHALLENGE });
  }
  return noStore(await producePage());
}
