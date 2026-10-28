import { describe, expect, it } from 'vitest';
import { parseRoute } from '../../src/routes.js';

// Every row of the address table in #8 and the grammar in ADR 0002.

describe('fixed addresses', () => {
  it.each([
    ['/', { kind: 'page' }],
    ['/health', { kind: 'health' }],
    ['/mcp', { kind: 'list', json: false }],
    ['/mcp.json', { kind: 'list', json: true }],
    ['/servers.schema.json', { kind: 'schema' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });
});

describe('server addresses', () => {
  it('parses the canonical endpoint', () => {
    expect(parseRoute('/org/uw/server/tc-helps/mcp')).toEqual({
      kind: 'server',
      org: 'uw',
      server: 'tc-helps',
      rest: '/mcp',
    });
  });

  it('parses a pinned version', () => {
    expect(parseRoute('/org/uw/server/tc-helps/v2/mcp')).toEqual({
      kind: 'server',
      org: 'uw',
      server: 'tc-helps',
      version: 'v2',
      rest: '/mcp',
    });
  });

  it('treats everything under the prefix as the server’s', () => {
    expect(parseRoute('/org/uw/server/tc-helps/health')).toMatchObject({ rest: '/health' });
    expect(parseRoute('/org/uw/server/tc-helps/v1/docs/page')).toMatchObject({
      version: 'v1',
      rest: '/docs/page',
    });
    expect(parseRoute('/org/uw/server/tc-helps/mcp/')).toMatchObject({ rest: '/mcp/' });
  });

  it('parses the bare prefix with an empty rest', () => {
    expect(parseRoute('/org/uw/server/tc-helps')).toEqual({
      kind: 'server',
      org: 'uw',
      server: 'tc-helps',
      rest: '',
    });
  });

  it('only takes v<digits> as a version', () => {
    expect(parseRoute('/org/uw/server/tc-helps/v2beta/mcp')).toMatchObject({ rest: '/v2beta/mcp' });
    expect(parseRoute('/org/uw/server/tc-helps/version/mcp')).toMatchObject({
      rest: '/version/mcp',
    });
  });
});

describe('shorthand addresses', () => {
  it('parses the bare shorthand', () => {
    expect(parseRoute('/s/tc-helps')).toEqual({
      kind: 'shorthand',
      shorthand: 'tc-helps',
      rest: '',
    });
  });

  it('keeps anything after the shorthand as the rest', () => {
    expect(parseRoute('/s/tc-helps/health')).toEqual({
      kind: 'shorthand',
      shorthand: 'tc-helps',
      rest: '/health',
    });
    expect(parseRoute('/s/tc-helps/v1/mcp')).toMatchObject({ rest: '/v1/mcp' });
  });
});

describe('unknown addresses', () => {
  it.each([
    '/org',
    '/org/uw',
    '/org/uw/server',
    '/org/uw/server/',
    '/org//server/x',
    '/orgs/uw/server/x/mcp',
    '/s',
    '/s/',
    '/mcp/extra',
    '/healthz',
    '/nope',
  ])('%s', (path) => {
    expect(parseRoute(path)).toEqual({ kind: 'unknown' });
  });
});
