import { describe, expect, it } from 'vitest';
import servers from '../../servers.json';
import { loadRegistry, type Registry } from '../../src/registry.js';
import { resolveTarget, type Resolution } from '../../src/resolve.js';
import { parseRoute } from '../../src/routes.js';
import { fixtureRegistry } from './fixtures.js';

function resolve(path: string, search = '', registry: Registry = fixtureRegistry): Resolution {
  const route = parseRoute(path);
  if (route.kind !== 'server' && route.kind !== 'shorthand') {
    throw new Error(`not a server route: ${path}`);
  }
  return resolveTarget(registry, route, search);
}

function urlOf(path: string, search = '', registry?: Registry): string {
  const resolution = resolve(path, search, registry);
  if (!resolution.ok) throw new Error(`refused: ${JSON.stringify(resolution)}`);
  return resolution.target.url.toString();
}

function refusalOf(path: string): { status: number; body: Record<string, string> } {
  const resolution = resolve(path);
  if (resolution.ok) throw new Error(`routed to ${resolution.target.url}`);
  return { status: resolution.status, body: resolution.body };
}

describe('backend address (ADR 0003, decision 9)', () => {
  it('serves the current version at the unversioned endpoint', () => {
    expect(urlOf('/org/uw/server/alpha/mcp')).toBe('https://alpha-v2.example/v2/mcp');
  });

  it('serves a pinned version', () => {
    expect(urlOf('/org/uw/server/alpha/v1/mcp')).toBe('https://alpha.example/api/mcp');
  });

  it('passes what follows /mcp and the query string', () => {
    expect(urlOf('/org/uw/server/alpha/v1/mcp/extra')).toBe('https://alpha.example/api/mcp/extra');
    expect(urlOf('/org/uw/server/alpha/mcp', '?a=1&b=2')).toBe(
      'https://alpha-v2.example/v2/mcp?a=1&b=2'
    );
  });

  it('maps the prefix onto the directory that holds the backend’s /mcp', () => {
    expect(urlOf('/org/uw/server/alpha/v1/health')).toBe('https://alpha.example/api/health');
    expect(urlOf('/org/uw/server/alpha/health')).toBe('https://alpha-v2.example/v2/health');
    expect(urlOf('/org/uw/server/shaky/health')).toBe('https://shaky.example/health');
  });

  it('treats the bare prefix as the endpoint', () => {
    expect(urlOf('/org/uw/server/alpha')).toBe('https://alpha-v2.example/v2/mcp');
  });

  it('names the entry and version it chose', () => {
    const resolution = resolve('/org/uw/server/alpha/mcp');
    expect(resolution.ok && resolution.target).toMatchObject({
      org: 'uw',
      server: 'alpha',
      versionKey: 'v2',
      version: { transport: 'streamable-http' },
    });
  });
});

describe('which entries are routed (ADR 0005)', () => {
  it('routes a degraded server', () => {
    expect(urlOf('/org/uw/server/shaky/mcp')).toBe('https://shaky.example/mcp');
  });

  it('keeps the same server slug apart under two organizations', () => {
    expect(urlOf('/org/other/server/alpha/mcp')).toBe('https://other-alpha.example/mcp');
  });

  it('refuses a dataset', () => {
    expect(refusalOf('/org/uw/server/data/mcp')).toEqual({
      status: 404,
      body: { error: 'not routed', kind: 'dataset' },
    });
  });

  it('refuses a planned server, pinned or not', () => {
    const planned = { status: 404, body: { error: 'not routed', status: 'planned' } };
    expect(refusalOf('/org/uw/server/soon/mcp')).toEqual(planned);
    expect(refusalOf('/org/uw/server/soon/v1/mcp')).toEqual(planned);
  });

  it('answers 410 for a retired server, by path and by shorthand', () => {
    const gone = { status: 410, body: { error: 'gone', status: 'retired' } };
    expect(refusalOf('/org/uw/server/old/mcp')).toEqual(gone);
    expect(refusalOf('/s/old')).toEqual(gone);
  });
});

describe('unknown org, server, version, or shorthand', () => {
  const notFound = { status: 404, body: { error: 'not found' } };

  it.each([
    '/org/nobody/server/alpha/mcp',
    '/org/uw/server/none/mcp',
    '/org/uw/server/alpha/v9/mcp',
    '/s/nope',
  ])('%s', (path) => {
    expect(refusalOf(path)).toEqual(notFound);
  });
});

describe('shorthand (ADR 0002)', () => {
  it('is the canonical endpoint of the current version', () => {
    expect(urlOf('/s/alpha')).toBe('https://alpha-v2.example/v2/mcp');
    expect(urlOf('/s/alpha/mcp')).toBe('https://alpha-v2.example/v2/mcp');
  });

  it('carries the rest like the canonical prefix does', () => {
    expect(urlOf('/s/alpha/health')).toBe('https://alpha-v2.example/v2/health');
    expect(urlOf('/s/alpha/v1/mcp')).toBe('https://alpha.example/api/mcp');
  });
});

describe('the real servers.json', () => {
  const registry = loadRegistry(servers);
  const available = registry.entries.filter((e) => e.kind === 'server' && e.status === 'available');

  it('has available servers', () => {
    expect(available.length).toBeGreaterThan(0);
  });

  it.each(available.map((e) => [e.org, e.server, e.shorthand, e.current ?? '', e.versions ?? {}]))(
    'routes %s/%s',
    (org, server, shorthand, current, versions) => {
      const backend = Object.entries(versions).find(([key]) => key === current)?.[1]?.backend;
      expect(urlOf(`/org/${org}/server/${server}/mcp`, '', registry)).toBe(backend);
      if (shorthand !== undefined) {
        expect(urlOf(`/s/${shorthand}`, '', registry)).toBe(backend);
      }
    }
  );
});
