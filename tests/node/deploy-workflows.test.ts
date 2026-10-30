import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Pins how the deploy workflows set the page credential (ADR 0006, decision
 * 3). wrangler-action uploads `secrets` with `wrangler secret bulk`, and only
 * its `environment` input adds `--env` to that command; `--env` inside
 * `command` does not carry over. The first staging deploy of 0.5.0 proved it:
 * the staging credential landed on the production Worker and staging answered
 * 503. Plain text assertions, since the repository has no YAML parser.
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

const SECRET_NAMES = ['PAGE_USERNAME', 'PAGE_PASSWORD'];

describe('deploy workflows set the page credential (ADR 0006)', () => {
  const staging = deployStep(STAGING_YML, 'Deploy to Staging');
  const production = deployStep(PRODUCTION_YML, 'Deploy to Production');

  it('staging passes the environment input, so the secrets go to the staging Worker', () => {
    expect(staging).toMatch(/^\s+environment: staging$/m);
    expect(staging).toMatch(/command: deploy --env staging$/m);
  });

  it('production passes no environment input, so the secrets go to the top-level Worker', () => {
    expect(production).not.toMatch(/^\s+environment:/m);
    expect(production).toMatch(/command: deploy$/m);
  });

  it.each([
    ['staging', staging, 'STAGING'],
    ['production', production, 'PRODUCTION'],
  ])('%s uploads both secrets from its own repository secrets', (_, step, suffix) => {
    for (const name of SECRET_NAMES) {
      expect(step).toContain(`${name}: \${{ secrets.${name}_${suffix} }}`);
      expect(step.split('\n').map((line) => line.trim())).toContain(name);
    }
  });
});
