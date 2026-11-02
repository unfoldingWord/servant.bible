/**
 * The page cookie's name and the two things the router does with a Cookie
 * header: read that one cookie's value (gate.ts) and strip it before a
 * request goes upstream (forward.ts), because the credential it stands for
 * is never sent to a server (ADR 0007, decisions 3 and 6).
 */

export const COOKIE_NAME = 'servant_bible_page';

function pairs(header: string): string[] {
  return header
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair !== '');
}

function named(pair: string, name: string): boolean {
  return pair.startsWith(`${name}=`);
}

/** The value of the named cookie in a Cookie header, or undefined when absent. */
export function cookieValue(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  const found = pairs(header).find((pair) => named(pair, name));
  return found?.slice(name.length + 1);
}

/** The Cookie header without the named cookie, or undefined when nothing is left. */
export function withoutCookie(header: string, name: string): string | undefined {
  const kept = pairs(header).filter((pair) => !named(pair, name));
  return kept.length === 0 ? undefined : kept.join('; ');
}
