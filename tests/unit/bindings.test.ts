import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import servers from '../../servers.json';
import { loadRegistry, type Entry, type Version } from '../../src/registry.js';

// Backends that are Workers on the unfoldingWord account must be reached by
// service binding (ADR 0003, decision 8). The platform refuses a Worker's
// public fetch to another Worker on the same account (Cloudflare error 1042),
// which the first workers.dev deployment of the router hit (#8).
//
// Three things have to agree: the `binding` on the list entry, the
// `[[services]]` entry in wrangler.toml, and the Worker it names. The stubs in
// vitest.config.ts stand in for the real Workers under those names and answer
// with their own name, so the last test proves the chain end to end.

type WorkerExports = { default: { fetch(input: string, init?: RequestInit): Promise<Response> } };
const worker = (exports as unknown as WorkerExports).default;

interface Listed {
  entry: Entry;
  key: string;
  version: Version;
}

const listed: Listed[] = loadRegistry(servers).entries.flatMap((entry) =>
  Object.entries(entry.versions ?? {}).map(([key, version]) => ({ entry, key, version }))
);
const named = listed.filter(({ version }) => version.binding !== undefined);

/** The Worker each binding must reach; wrangler.toml says the same. */
const SERVICE_OF = new Map([
  ['TC_HELPS_V2', 'translation-helps-mcp-v2'],
  ['OBS_5M', 'obs-5m-mcp'],
  ['FIA', 'fia-mcp'],
]);

function label({ entry, key }: Listed): string {
  return `${entry.org}/${entry.server} ${key}`;
}

describe('service bindings (ADR 0003, decision 8)', () => {
  it('every backend that is a Worker on the unfoldingWord account names a binding', () => {
    const own = listed.filter(({ version }) =>
      new URL(version.backend).hostname.endsWith('.unfoldingword.workers.dev')
    );

    expect(own.length).toBeGreaterThan(0);
    for (const item of own) {
      expect(item.version.binding, label(item)).toBeDefined();
    }
  });

  it('every binding named in servers.json is bound in the Worker', () => {
    expect(named.length).toBeGreaterThan(0);
    for (const item of named) {
      const bound = Object.entries(env).find(([key]) => key === item.version.binding)?.[1];
      expect(typeof (bound as { fetch?: unknown } | undefined)?.fetch, label(item)).toBe(
        'function'
      );
    }
  });

  it('every binding has a known Worker name', () => {
    for (const item of named) {
      expect(SERVICE_OF.has(item.version.binding ?? ''), label(item)).toBe(true);
    }
  });

  it.each(named.map((item) => [label(item), item]))(
    'forwards %s through its binding to the Worker wrangler.toml names',
    async (_, item) => {
      const path = `/org/${item.entry.org}/server/${item.entry.server}/${item.key}/mcp`;
      const response = await worker.fetch(`https://example.com${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        stub: SERVICE_OF.get(item.version.binding ?? ''),
        url: item.version.backend,
      });
    }
  );
});
