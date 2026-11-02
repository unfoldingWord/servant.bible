import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../../src/token.js';

/**
 * The cookie token (ADR 0007, decision 3): the expiry as Unix seconds and an
 * HMAC-SHA256 over the expiry and the credential, under the cookie secret.
 * Pure functions: no Request, no Response, no clock of their own.
 */

const SECRET = 'fixture-cookie-secret-0123456789abcdef';
const CREDENTIAL = 'reader:open sesame: ünïcode';
const NOW = 1_800_000_000;
const LATER = NOW + 3600;

describe('signToken', () => {
  it('produces <expiry>.<base64url signature> and is deterministic', async () => {
    const token = await signToken(SECRET, CREDENTIAL, LATER);

    expect(token).toMatch(/^1800003600\.[A-Za-z0-9_-]{43}$/);
    expect(await signToken(SECRET, CREDENTIAL, LATER)).toBe(token);
  });
});

describe('verifyToken', () => {
  it('accepts its own token before the expiry', async () => {
    const token = await signToken(SECRET, CREDENTIAL, LATER);

    expect(await verifyToken(SECRET, CREDENTIAL, token, NOW)).toBe(true);
    expect(await verifyToken(SECRET, CREDENTIAL, token, LATER - 1)).toBe(true);
  });

  it('refuses a token at or past its expiry', async () => {
    const token = await signToken(SECRET, CREDENTIAL, LATER);

    expect(await verifyToken(SECRET, CREDENTIAL, token, LATER)).toBe(false);
    expect(await verifyToken(SECRET, CREDENTIAL, token, LATER + 1)).toBe(false);
  });

  it('refuses a changed signature or a changed expiry', async () => {
    const token = await signToken(SECRET, CREDENTIAL, LATER);
    const [expiry, signature] = token.split('.') as [string, string];
    const flipped = signature.endsWith('A') ? 'B' : 'A';
    const otherSignature = `${expiry}.${signature.slice(0, -1)}${flipped}`;
    const otherExpiry = `${LATER + 1}.${signature}`;

    expect(await verifyToken(SECRET, CREDENTIAL, otherSignature, NOW)).toBe(false);
    expect(await verifyToken(SECRET, CREDENTIAL, otherExpiry, NOW)).toBe(false);
  });

  it('refuses a token signed under another secret or for another credential', async () => {
    const token = await signToken(SECRET, CREDENTIAL, LATER);

    expect(await verifyToken(`${SECRET}x`, CREDENTIAL, token, NOW)).toBe(false);
    expect(await verifyToken(SECRET, 'reader:rotated', token, NOW)).toBe(false);
    expect(
      await verifyToken(SECRET, CREDENTIAL, await signToken('other', CREDENTIAL, LATER), NOW)
    ).toBe(false);
  });

  it('refuses malformed tokens without throwing', async () => {
    const junk = [
      '',
      'abc',
      '1.2.3',
      `${LATER}`,
      `${LATER}.`,
      `.${'A'.repeat(43)}`,
      `abc.${'A'.repeat(43)}`,
    ];
    for (const token of junk) {
      expect(await verifyToken(SECRET, CREDENTIAL, token, NOW), token).toBe(false);
    }
    expect(await verifyToken(SECRET, CREDENTIAL, `${LATER}.${'A'.repeat(43)}`, NOW)).toBe(false);
  });
});
