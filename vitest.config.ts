import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Two projects. `workers` runs inside the Workers runtime (workerd) against the
// real wrangler.toml, so the ASSETS binding, vars, and compatibility settings
// match a deploy. `node` runs the dev-time scripts, such as the servers.json
// validator, which lean on ajv: ajv compiles schemas with `new Function`,
// which workerd refuses.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.toml' },
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
