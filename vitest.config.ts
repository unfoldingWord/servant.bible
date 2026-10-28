import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Two projects. `workers` runs inside the Workers runtime (workerd) against the
// real wrangler.toml, so the ASSETS binding, vars, and compatibility settings
// match a deploy. `node` runs the dev-time scripts, such as the servers.json
// validator, which lean on ajv: ajv compiles schemas with `new Function`,
// which workerd refuses.

/**
 * The Workers that wrangler.toml binds by service binding, as stubs. Each
 * answers with its own name and the URL it received, so tests can prove that a
 * list entry's `binding` reaches the Worker wrangler.toml names. The names
 * must match `[[services]]` exactly or the workers project fails to start.
 */
const BOUND_WORKERS = ['translation-helps-mcp-v2', 'obs-5m-mcp', 'fia-mcp'];

function stubWorker(name: string) {
  return {
    name,
    modules: true,
    compatibilityDate: '2026-08-01',
    script: `export default {
      async fetch(request) {
        await request.text();
        const body = JSON.stringify({ stub: ${JSON.stringify(name)}, url: request.url });
        return new Response(body, { headers: { 'content-type': 'application/json' } });
      },
    };`,
  };
}

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.toml' },
            miniflare: { workers: BOUND_WORKERS.map(stubWorker) },
          }),
        ],
        test: {
          name: 'workers',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/node/**/*.test.ts'],
        },
      },
    ],
  },
});
