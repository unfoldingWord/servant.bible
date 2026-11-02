import { describe, expect, it } from 'vitest';

import { renderSignIn } from '../../scripts/page/sign-in.mjs';
import { parseRoute } from '../../src/routes.js';

/**
 * The sign-in page (ADR 0007, decision 1): the gate's front door, built by
 * the same generator as the page so it shares the stylesheet. Two variants,
 * one plain and one that says the credential did not match.
 */

const OPTIONS = { css: '.fixture-css{}', version: '9.9.9' };
const plain = renderSignIn({ ...OPTIONS, failed: false });
const failed = renderSignIn({ ...OPTIONS, failed: true });

describe('the sign-in page', () => {
  it('carries the form the router answers at POST /sign-in', () => {
    expect(plain).toContain('<form class="sign-in-card" method="post" action="/sign-in">');
    expect(plain).toMatch(/<input[^>]*name="username"[^>]*autocomplete="username"/);
    expect(plain).toMatch(
      /<input[^>]*name="password"[^>]*type="password"[^>]*autocomplete="current-password"/
    );
    expect(plain).toContain('<button class="btn btn-primary" type="submit">Sign in</button>');
  });

  it('says the credential did not match only in the failed variant', () => {
    expect(failed).toContain('<p class="form-error" role="alert">');
    expect(failed).toContain('did not match');
    expect(plain).not.toContain('class="form-error"');
    expect(plain).not.toContain('did not match');
  });

  it('is a complete document in the site design with no script', () => {
    for (const html of [plain, failed]) {
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('<meta charset="utf-8" />');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('<title>Sign in · Servant.Bible</title>');
      expect(html).toContain(OPTIONS.css);
      expect(html).toContain('Servant.Bible 9.9.9');
      expect(html).not.toContain('<script');
      const links = html.match(/<link[^>]*>/g) ?? [];
      for (const link of links) expect(link).toMatch(/href="https:\/\/fonts\.googleapis\.com\//);
    }
  });

  it('links and posts only to addresses the router answers', () => {
    const internal = [...plain.matchAll(/(?:href|action)="(\/[^"]*)"/g)].map((m) => m[1] ?? '');
    expect(internal).toContain('/sign-in');
    expect(internal).toContain('/mcp.json');
    for (const target of internal) {
      expect(parseRoute(target).kind, target).not.toBe('unknown');
    }
  });

  it('never carries a sign-out form: there is nothing to sign out of', () => {
    expect(plain).not.toContain('/sign-out');
  });
});
