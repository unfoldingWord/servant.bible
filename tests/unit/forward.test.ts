import { afterEach, describe, expect, it, vi } from 'vitest';
import { forward, type ForwardDeps } from '../../src/forward.js';
import type { Target } from '../../src/resolve.js';
import { resolveTarget } from '../../src/resolve.js';
import { parseRoute } from '../../src/routes.js';
import { ECHO_SESSION, echo, echoBinding, fixtureRegistry, type Echo } from './fixtures.js';

// The forwarding rules of #8 (ADR 0003, decisions 6 to 9), against a stub
// backend that echoes method, body, and headers, streams an SSE body, and sets
// Mcp-Session-Id.

function targetFor(path: string): Target {
  const route = parseRoute(path);
  if (route.kind !== 'server') throw new Error(`not a server route: ${path}`);
  const resolution = resolveTarget(fixtureRegistry, route, '');
  if (!resolution.ok) throw new Error(`refused: ${path}`);
  return resolution.target;
}

const deps: ForwardDeps = {
  fetch: (request) => echo(request),
  binding: (name) => (name === 'BOUND' ? echoBinding() : undefined),
};

const ALPHA = targetFor('/org/uw/server/alpha/mcp');

const RPC = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';

async function sendThrough(init: RequestInit, target = ALPHA, using = deps): Promise<Echo> {
  const request = new Request('https://servant.bible/org/uw/server/alpha/mcp', init);
  const response = await forward(request, target, using);
  return (await response.json()) as Echo;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('method, body, and address', () => {
  it('passes the method and body unchanged to the backend address', async () => {
    const seen = await sendThrough({ method: 'POST', body: RPC });

    expect(seen.method).toBe('POST');
    expect(seen.body).toBe(RPC);
    expect(seen.url).toBe('https://alpha-v2.example/v2/mcp');
    expect(seen.via).toBe('fetch');
  });

  it('never follows a backend redirect on the caller’s behalf', async () => {
    const seen = await sendThrough({ method: 'POST', body: RPC });

    expect(seen.redirect).toBe('manual');
  });
});

describe('request headers', () => {
  it('passes the MCP and auth headers through', async () => {
    const headers = {
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer caller-token',
      'content-type': 'application/json',
      'mcp-session-id': 'abc',
      'mcp-protocol-version': '2025-06-18',
      'api-key': 'caller-key',
    };
    const seen = await sendThrough({ method: 'POST', body: RPC, headers });

    expect(seen.headers).toMatchObject(headers);
  });

  it('drops hop-by-hop headers and the caller’s Host', async () => {
    const seen = await sendThrough({
      headers: {
        connection: 'keep-alive, x-dropped',
        'keep-alive': 'timeout=5',
        te: 'trailers',
        upgrade: 'h2c',
        'x-dropped': 'named in connection',
        host: 'servant.bible',
        'x-kept': 'yes',
      },
    });

    for (const name of ['connection', 'keep-alive', 'te', 'upgrade', 'x-dropped']) {
      expect(seen.headers).not.toHaveProperty(name);
    }
    expect(seen.headers.host).not.toBe('servant.bible');
    expect(seen.headers['x-kept']).toBe('yes');
  });
});

describe('response', () => {
  it('returns the backend’s status and headers, including Mcp-Session-Id', async () => {
    const request = new Request('https://servant.bible/org/uw/server/alpha/mcp');
    const response = await forward(request, ALPHA, deps);

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBe(ECHO_SESSION);
    expect(response.headers.get('content-type')).toBe('application/json');
  });

  it('streams an event-stream body without buffering it', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('data: {"first":true}\n\n'));
        await gate;
        controller.enqueue(encoder.encode('data: {"last":true}\n\n'));
        controller.close();
      },
    });
    const streaming: ForwardDeps = {
      ...deps,
      fetch: async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    };

    const request = new Request('https://servant.bible/org/uw/server/alpha/mcp');
    const response = await forward(request, ALPHA, streaming);
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error('no body');
    const first = await reader.read();

    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(new TextDecoder().decode(first.value)).toContain('"first":true');
    release();
    const rest = await reader.read();
    expect(new TextDecoder().decode(rest.value)).toContain('"last":true');
    expect((await reader.read()).done).toBe(true);
  });
});

describe('response headers the runtime has already acted on', () => {
  function replying(headers: Record<string, string>): ForwardDeps {
    return { ...deps, fetch: async () => new Response('{"ok":true}', { headers }) };
  }
  const request = new Request('https://servant.bible/org/uw/server/alpha/mcp');

  it('drops content-encoding and content-length, because the body it forwards is decoded', async () => {
    const response = await forward(
      request,
      ALPHA,
      replying({
        'content-encoding': 'gzip',
        'content-length': '31',
        'content-type': 'application/json',
        'x-kept': 'yes',
      })
    );

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('x-kept')).toBe('yes');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('keeps content-length when the body was not encoded', async () => {
    const response = await forward(request, ALPHA, replying({ 'content-length': '11' }));

    expect(response.headers.get('content-length')).toBe('11');
  });

  it('drops hop-by-hop response headers', async () => {
    const response = await forward(
      request,
      ALPHA,
      replying({ connection: 'close, x-named', 'keep-alive': 'timeout=5', 'x-named': 'dropped' })
    );

    for (const name of ['connection', 'keep-alive', 'x-named']) {
      expect(response.headers.get(name)).toBeNull();
    }
  });
});

describe('service bindings (ADR 0003, decision 8)', () => {
  it('uses the binding the version names', async () => {
    const seen = await sendThrough(
      { method: 'POST', body: RPC },
      targetFor('/org/uw/server/bound/mcp')
    );

    expect(seen.via).toBe('binding');
    expect(seen.url).toBe('https://bound.example/mcp');
    expect(seen.body).toBe(RPC);
  });

  it('answers 502 and logs when the named binding is not configured', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unbound: ForwardDeps = { ...deps, binding: () => undefined };
    const request = new Request('https://servant.bible/org/uw/server/bound/mcp');

    const response = await forward(request, targetFor('/org/uw/server/bound/mcp'), unbound);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'bad gateway',
      reason: 'binding not configured',
    });
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toContain('BOUND');
  });
});

describe('failures and the log line', () => {
  it('answers 502 and logs when the backend cannot be reached', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken: ForwardDeps = {
      ...deps,
      fetch: () => Promise.reject(new Error('connect failed')),
    };
    const request = new Request('https://servant.bible/org/uw/server/alpha/mcp');

    const response = await forward(request, ALPHA, broken);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'bad gateway', reason: 'upstream unreachable' });
    expect(error.mock.calls[0]?.[0]).toContain('connect failed');
  });

  it('logs one structured line per forwarded request, without the body', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await sendThrough({ method: 'POST', body: RPC });

    expect(log).toHaveBeenCalledOnce();
    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      event: 'forward',
      org: 'uw',
      server: 'alpha',
      version: 'v2',
      method: 'POST',
      upstream_status: 200,
    });
    expect(JSON.parse(line).duration_ms).toBeTypeOf('number');
    expect(line).not.toContain('tools/list');
  });
});
