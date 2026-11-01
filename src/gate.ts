import { COOKIE_NAME, cookieValue } from './cookie.js';
import { json } from './http.js';
import { logPageGateUnconfigured } from './log.js';
import { sameSecret, signToken, verifyToken } from './token.js';

/**
 * The page gate (ADR 0006, amended by ADR 0007): one shared username and
 * password in front of the page only, presented once through the sign-in
 * page and remembered by a signed cookie, or on every request as a Basic
 * header for scripts. The three secrets come from the deploy workflows;
 * wrangler.toml never carries them. The gate fails closed: a missing secret
 * means no page, not an open page. A program never meets this code, because
 * only the page routes call it.
 */

export interface GateEnv {
  PAGE_USERNAME?: string;
  PAGE_PASSWORD?: string;
  PAGE_COOKIE_SECRET?: string;
}

/** The pages the gate answers with, fetched by the router from the asset layer. */
export interface PageAssets {
  page(): Promise<Response>;
  signIn(failed: boolean): Promise<Response>;
}

interface PageGate {
  credential: string;
  secret: string;
}

type Opened = { ok: true; gate: PageGate } | { ok: false; response: Response };
type Form = { ok: true; fields: URLSearchParams } | { ok: false; response: Response };

const NO_STORE = { 'cache-control': 'private, no-store' };
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** 30 days, in seconds (ADR 0007, decision 3). */
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Lax';
const FORM_TYPE = 'application/x-www-form-urlencoded';
/** More than enough for a username and a password; anything larger is not a sign-in. */
const FORM_LIMIT = 4096;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** The gate, or the 503 that fails closed, logging which secrets are missing. */
function open(env: GateEnv): Opened {
  const secrets: [string, unknown][] = [
    ['PAGE_USERNAME', env.PAGE_USERNAME],
    ['PAGE_PASSWORD', env.PAGE_PASSWORD],
    ['PAGE_COOKIE_SECRET', env.PAGE_COOKIE_SECRET],
  ];
  const missing = secrets.filter(([, value]) => !nonEmpty(value)).map(([name]) => name);
  if (missing.length > 0) {
    logPageGateUnconfigured(missing);
    return { ok: false, response: json({ error: 'page gate not configured' }, 503, NO_STORE) };
  }
  const gate = {
    credential: `${env.PAGE_USERNAME}:${env.PAGE_PASSWORD}`,
    secret: env.PAGE_COOKIE_SECRET ?? '',
  };
  return { ok: true, gate };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
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

/** A valid cookie, or a correct Basic header (ADR 0007, decisions 3 and 5). */
async function authorized(request: Request, gate: PageGate): Promise<boolean> {
  const token = cookieValue(request.headers.get('cookie'), COOKIE_NAME);
  if (
    token !== undefined &&
    (await verifyToken(gate.secret, gate.credential, token, nowSeconds()))
  ) {
    return true;
  }
  const given = presented(request);
  return given !== undefined && sameSecret(given, gate.credential);
}

/** The response marked so no shared cache keeps what the gate protects, with the status given. */
function answer(response: Response, status = response.status): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', NO_STORE['cache-control']);
  return new Response(response.body, { status, headers });
}

function home(cookie: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: '/', 'set-cookie': cookie, ...NO_STORE },
  });
}

/** The form fields, or the 415 or 413 that refuses the body before any comparison. */
async function readForm(request: Request): Promise<Form> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== FORM_TYPE) {
    return { ok: false, response: json({ error: 'unsupported media type' }, 415, NO_STORE) };
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  const text = declared > FORM_LIMIT ? '' : await request.text();
  if (declared > FORM_LIMIT || text.length > FORM_LIMIT) {
    return { ok: false, response: json({ error: 'form too large' }, 413, NO_STORE) };
  }
  return { ok: true, fields: new URLSearchParams(text) };
}

/** `GET /` and the HTML view of `/mcp`: the page to a credential, the sign-in page (401) otherwise. */
export async function gated(env: GateEnv, request: Request, assets: PageAssets): Promise<Response> {
  const opened = open(env);
  if (!opened.ok) return opened.response;
  if (await authorized(request, opened.gate)) return answer(await assets.page());
  return answer(await assets.signIn(false), 401);
}

/** `GET /sign-in`: the sign-in page itself. */
export async function showSignIn(env: GateEnv, assets: PageAssets): Promise<Response> {
  const opened = open(env);
  if (!opened.ok) return opened.response;
  return answer(await assets.signIn(false));
}

/** `POST /sign-in`: the cookie and a redirect home on a match, the failed page (401) otherwise. */
export async function signIn(
  env: GateEnv,
  request: Request,
  assets: PageAssets
): Promise<Response> {
  const opened = open(env);
  if (!opened.ok) return opened.response;
  const form = await readForm(request);
  if (!form.ok) return form.response;
  const given = `${form.fields.get('username') ?? ''}:${form.fields.get('password') ?? ''}`;
  if (!sameSecret(given, opened.gate.credential)) return answer(await assets.signIn(true), 401);
  const expiresAt = nowSeconds() + COOKIE_MAX_AGE;
  const token = await signToken(opened.gate.secret, opened.gate.credential, expiresAt);
  return home(`${COOKIE_NAME}=${token}; Max-Age=${COOKIE_MAX_AGE}; ${COOKIE_ATTRIBUTES}`);
}

/** `POST /sign-out`: clear the cookie and go home. */
export function signOut(env: GateEnv): Response {
  const opened = open(env);
  if (!opened.ok) return opened.response;
  return home(`${COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`);
}
