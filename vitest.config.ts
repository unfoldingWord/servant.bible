import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime (workerd) against the real wrangler.toml,
// so the ASSETS binding, vars, and compatibility settings match a deploy.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
