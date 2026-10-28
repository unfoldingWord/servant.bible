import type { Registry } from './registry.js';

/**
 * The list as a program reads it at /mcp and /mcp.json (ADR 0002). It is the
 * registry as bundled, with `$schema` pointing at the published schema instead
 * of the repository-relative path servers.json uses.
 */

export const SCHEMA_URL = 'https://servant.bible/servers.schema.json';

export function listBody(registry: Registry): { $schema: string; entries: Registry['entries'] } {
  return { $schema: SCHEMA_URL, entries: registry.entries };
}

/** A browser says so in Accept; programs and tools that set nothing get JSON. */
export function wantsHtml(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('text/html');
}
