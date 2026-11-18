import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Pins what the deploy workflows send to Cloudflare. The page is public and
 * the router holds no secrets (ADR 0010, decision 4), so neither workflow
 * reads, checks, or uploads a page secret; each still deploys to its own
 * Worker. Plain text assertions, since the repository has no YAML parser.
 */

const STAGING_YML = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const PRODUCTION_YML = readFileSync('.github/workflows/deploy.yml', 'utf8');

function deployStep(text: string, stepName: string): string {
  const start = text.indexOf(`- name: ${stepName}`);
  expect(start, `step "${stepName}"`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n {6}- name: /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('each deploy workflow deploys to its own Worker', () => {
  it('staging deploys the staging environment', () => {
    expect(deployStep(STAGING_YML, 'Deploy to Staging')).toMatch(/command: deploy --env staging$/m);
  });

  it('production deploys the top-level Worker', () => {
    const production = deployStep(PRODUCTION_YML, 'Deploy to Production');
    expect(production).not.toMatch(/^\s+environment:/m);
    expect(production).toMatch(/command: deploy$/m);
  });
});

describe('deploy workflows carry no page secret (ADR 0010, decision 4)', () => {
  it.each([
    ['staging', STAGING_YML],
    ['production', PRODUCTION_YML],
  ])('%s reads, checks, and uploads none', (_, text) => {
    expect(text).not.toContain('PAGE_');
    expect(text).not.toMatch(/^\s+secrets:/m);
    expect(text).not.toContain('Assert the page credential is present');
  });

  // The only repository secrets a deploy may read are the two it needs to
  // reach Cloudflare.
  it.each([
    ['staging', STAGING_YML],
    ['production', PRODUCTION_YML],
  ])('%s reads only the Cloudflare token and account', (_, text) => {
    const read = [...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
    expect([...new Set(read)].sort()).toEqual(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']);
  });
});
