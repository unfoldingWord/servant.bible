import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Pins the branching model (ADR 0009): `develop` is the integration branch
 * and staging follows it; `main` is the release branch and production deploys
 * only from a `v*` tag on it. Plain text assertions, since the repository has
 * no YAML parser.
 */

const CI_YML = readFileSync('.github/workflows/ci.yml', 'utf8');
const STAGING_YML = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const PRODUCTION_YML = readFileSync('.github/workflows/deploy.yml', 'utf8');
const TAG_YML = readFileSync('.github/workflows/tag.yml', 'utf8');
const CODEOWNERS_PATH = '.github/CODEOWNERS';

const PUSH_ONLY = "github.event.workflow_run.event == 'push'";
const NOT_SUPERSEDED = "if: steps.tip.outputs.superseded != 'true'";
const TIP_GUARD = 'Skip if a newer push to develop exists';

/** The `on:` block of a workflow: everything between `on:` and `jobs:`. */
function onBlock(text: string): string {
  return text.slice(text.indexOf('\non:'), text.indexOf('\njobs:'));
}

/** One step, from its `- name:` line to the next step. */
function step(text: string, name: string): string {
  const start = text.indexOf(`- name: ${name}`);
  expect(start, `step "${name}"`).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n {6}- /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('CI follows the develop/main branching model', () => {
  it('runs on push and pull_request for main and develop', () => {
    const on = onBlock(CI_YML);
    expect(on).toMatch(/push:\s*\n\s*branches: \[main, develop\]/);
    expect(on).toMatch(/pull_request:\s*\n\s*branches: \[main, develop\]/);
  });

  const releaseSource = CI_YML.slice(
    CI_YML.indexOf('release-source:'),
    CI_YML.indexOf('security-audit:')
  );

  it('has a Release Source job that runs only on a pull request into main', () => {
    expect(releaseSource).toContain('name: Release Source');
    expect(releaseSource).toContain(
      "if: ${{ github.event_name == 'pull_request' && github.base_ref == 'main' }}"
    );
  });

  it('Release Source accepts develop and hotfix/* and fails anything else', () => {
    expect(releaseSource).toMatch(/develop\|hotfix\/\*\)/);
    expect(releaseSource).toMatch(/\*\)\s*\n\s*echo "::error::[^\n]*\n\s*exit 1/);
  });

  // A pull request's author picks the branch name, so interpolating it into
  // the script would let a crafted name run shell commands in the job.
  it('Release Source reads the branch name from env, never inline in the script', () => {
    expect(releaseSource).toContain('HEAD_REF: ${{ github.head_ref }}');
    const script = releaseSource.slice(releaseSource.indexOf('run: |'));
    expect(script).not.toContain('${{');
  });
});

describe('staging follows develop', () => {
  it('deploys after CI on develop only, and never on a pull request', () => {
    const on = onBlock(STAGING_YML);
    expect(on).toMatch(/workflow_run:[\s\S]*branches: \[develop\]/);
    expect(on).not.toContain('pull_request');
  });

  // A release pull request (develop into main) also runs CI with head branch
  // develop, which the branch filter matches; without this each merge into
  // develop would deploy staging twice while a release is open.
  it('deploys only after a CI run that a push triggered', () => {
    expect(STAGING_YML).toContain(PUSH_ONLY);
  });

  it('runs one staging deploy at a time and never cancels the running one', () => {
    expect(STAGING_YML).toMatch(
      /concurrency:\s*\n\s*group: deploy-staging\s*\n\s*cancel-in-progress: false/
    );
  });

  // Two pushes to develop can finish CI in either order; the older one must
  // not deploy over the newer one.
  it('skips the deploy when its commit is no longer the tip of develop', () => {
    const guard = step(STAGING_YML, TIP_GUARD);
    expect(guard).toContain('id: tip');
    expect(guard).toContain('HEAD_SHA: ${{ github.event.workflow_run.head_sha }}');
    expect(guard).toContain('git fetch --no-tags origin develop');
    expect(guard).toContain('git rev-parse origin/develop');
    expect(guard).toContain('superseded=true');
    expect(STAGING_YML).toMatch(/fetch-depth: 0/);
  });

  it('conditions every step after the guard, the deploy included, on not being superseded', () => {
    const guardAt = STAGING_YML.indexOf(`- name: ${TIP_GUARD}`);
    expect(guardAt).toBeGreaterThan(-1);
    const after = STAGING_YML.slice(STAGING_YML.indexOf('\n      - ', guardAt));
    const steps = after.split(/\n {6}- /).filter((s) => s.trim() !== '');
    expect(steps.length).toBeGreaterThanOrEqual(6);
    expect(steps.some((s) => s.includes('wrangler-action'))).toBe(true);
    for (const s of steps) {
      expect(s, s.split('\n')[0]).toContain(NOT_SUPERSEDED);
    }
  });
});

describe('production deploys only from a v* tag on main', () => {
  it('refuses any ref that is not a v* tag before it checks anything out', () => {
    const guardAt = PRODUCTION_YML.indexOf('- name: Require a v* release tag');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(PRODUCTION_YML.indexOf('actions/checkout'));
    const guard = step(PRODUCTION_YML, 'Require a v* release tag');
    expect(guard).toContain('refs/tags/v*)');
    expect(guard).toContain('exit 1');
  });

  it('refuses a tag whose commit is not on main, before any deploy', () => {
    const guardAt = PRODUCTION_YML.indexOf('- name: Require the tag to be on main');
    expect(guardAt).toBeGreaterThan(PRODUCTION_YML.indexOf('actions/checkout'));
    expect(guardAt).toBeLessThan(PRODUCTION_YML.indexOf('wrangler-action'));
    const guard = step(PRODUCTION_YML, 'Require the tag to be on main');
    expect(guard).toContain('git fetch --no-tags origin main');
    expect(guard).toContain('git merge-base --is-ancestor');
    expect(guard).toContain('origin/main');
    expect(guard).toContain('exit 1');
    expect(PRODUCTION_YML).toMatch(/fetch-depth: 0/);
  });

  it('no longer accepts a dispatch from the main branch itself', () => {
    expect(PRODUCTION_YML).not.toContain('refs/heads/main');
  });
});

describe('release tags are cut on main only', () => {
  it('tags after CI on main, never on develop', () => {
    const on = onBlock(TAG_YML);
    expect(on).toMatch(/workflow_run:[\s\S]*branches: \[main\]/);
    expect(on).not.toContain('develop');
  });

  // A pull request from a fork whose head branch is named main matches the
  // branch filter too; only a push to this repository's main may cut a tag.
  it('tags only after a CI run that a push triggered', () => {
    expect(TAG_YML).toContain(PUSH_ONLY);
  });
});

describe('code owners back the review a pull request into main needs', () => {
  it('names an owner for every path', () => {
    const owners = readFileSync(CODEOWNERS_PATH, 'utf8');
    expect(owners).toMatch(/^\* @IanLindsley$/m);
  });
});
