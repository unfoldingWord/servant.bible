import { APP_VERSION } from './generated/version.js';

/**
 * The Servant.Bible router Worker (ADR 0003). This file is the apex: every
 * request to servant.bible lands here. #8 adds the /org, /s, and /mcp routes
 * and the forwarding rules; until then the Worker answers /health, hands / to
 * the asset layer, and refuses everything else.
 */

export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function health(env: Env): Response {
  return json({ status: 'healthy', version: APP_VERSION, environment: env.ENVIRONMENT });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/health' && request.method === 'GET') {
      return health(env);
    }
    if (pathname === '/') {
      return env.ASSETS.fetch(request);
    }
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
