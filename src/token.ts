/**
 * The cookie token (ADR 0007, decision 3): `<expiry>.<signature>`, the expiry
 * as Unix seconds and the base64url HMAC-SHA256, under the cookie secret, of
 * the expiry and the credential together. Signing over the credential means
 * a rotated password invalidates every token without a new secret. Pure:
 * the caller supplies the clock.
 */

const encoder = new TextEncoder();

/** Digits, a dot, and the 43 base64url characters of a 32-byte MAC. */
const TOKEN = /^([0-9]{1,12})\.([A-Za-z0-9_-]{43})$/;

function base64url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signature(secret: string, credential: string, expiresAt: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${expiresAt}\n${credential}`));
  return base64url(mac);
}

/** Constant-time equality of two strings, as the UTF-8 bytes they encode. */
export function sameSecret(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}

export async function signToken(
  secret: string,
  credential: string,
  expiresAt: number
): Promise<string> {
  return `${expiresAt}.${await signature(secret, credential, expiresAt)}`;
}

/** True only for a well-formed token, unexpired at `now`, signed for this credential under this secret. */
export async function verifyToken(
  secret: string,
  credential: string,
  token: string,
  now: number
): Promise<boolean> {
  const match = TOKEN.exec(token);
  if (match === null) return false;
  const [, expiry = '', given = ''] = match;
  const expiresAt = Number(expiry);
  if (!(expiresAt > now)) return false;
  return sameSecret(given, await signature(secret, credential, expiresAt));
}
