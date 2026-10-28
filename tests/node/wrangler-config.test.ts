import { describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';

/**
 * Pins which hostnames each deployment owns (#11, ADR 0003 decisions 3 and
 * 4). `routes` is an inheritable wrangler key: an `[env.staging]` block
 * without its own would inherit production's custom domains, and the staging
 * deploy would try to take `servant.bible`. Reading the file through
 * wrangler's own reader shows the config exactly as `wrangler deploy` and
 * `wrangler deploy --env staging` resolve it, inheritance included. It runs
 * under Node because the reader is wrangler's Node API.
 */

const CONFIG = 'wrangler.toml';

function production() {
  return unstable_readConfig({ config: CONFIG });
}

function staging() {
  return unstable_readConfig({ config: CONFIG, env: 'staging' });
}

function hostnames(routes: unknown): string[] {
  expect(Array.isArray(routes)).toBe(true);
  return (routes as { pattern: string; custom_domain?: boolean }[]).map((route) => {
    expect(route.custom_domain).toBe(true);
    return route.pattern;
  });
}

describe('wrangler.toml custom domains (#11)', () => {
  it('production owns the apex and www, as custom domains', () => {
    const config = production();
    expect(config.name).toBe('servant-bible');
    expect(config.vars.ENVIRONMENT).toBe('production');
    expect(hostnames(config.routes).sort()).toEqual(['servant.bible', 'www.servant.bible']);
  });

  it('staging owns staging.servant.bible only, as a custom domain', () => {
    const config = staging();
    expect(config.name).toBe('servant-bible-staging');
    expect(config.vars.ENVIRONMENT).toBe('staging');
    expect(hostnames(config.routes)).toEqual(['staging.servant.bible']);
  });

  it('no hostname is claimed by both deployments', () => {
    const shared = hostnames(production().routes).filter((hostname) =>
      hostnames(staging().routes).includes(hostname)
    );
    expect(shared).toEqual([]);
  });

  it('keeps the workers.dev names in both deployments for now', () => {
    expect(production().workers_dev).toBe(true);
    expect(staging().workers_dev).toBe(true);
  });

  it('keeps the service bindings of staging in step with production', () => {
    const bindings = (config: { services?: { binding: string; service: string }[] }) =>
      (config.services ?? []).map(({ binding, service }) => ({ binding, service }));
    expect(bindings(staging())).toEqual(bindings(production()));
  });
});
