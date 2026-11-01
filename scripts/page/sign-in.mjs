/**
 * Render the sign-in page (ADR 0007, decision 1): the gate's front door, in
 * the page's own design and stylesheet. Two variants from one template: the
 * plain page, and the one that says the credential did not match. Pure, like
 * render.mjs; the generator writes both files beside index.html. No script:
 * a form needs none.
 */

import { brand, colophon, documentHead, escape } from './render.mjs';

const TITLE = 'Sign in · Servant.Bible';
const DESCRIPTION = 'Sign in to the Servant.Bible page.';
const FAILED = 'That username and password did not match.';
const LEAD =
  'The Servant.Bible page is behind a shared password while the team settles a few things. Everything a program calls stays open: the list at <a href="/mcp.json">/mcp.json</a> and every server address answer without signing in.';

function field(label, name, type, autocomplete, extra = '') {
  const input = `<input name="${name}" type="${type}" autocomplete="${autocomplete}" required${extra} />`;
  return `<label class="field"><span>${label}</span>${input}</label>`;
}

function form(failed) {
  const parts = [
    '<span class="eyebrow">Private preview</span>',
    '<h1>Sign in</h1>',
    `<p class="lead">${LEAD}</p>`,
    failed ? `<p class="form-error" role="alert">${escape(FAILED)}</p>` : '',
    field('Username', 'username', 'text', 'username', ' autofocus'),
    field('Password', 'password', 'password', 'current-password'),
    '<button class="btn btn-primary" type="submit">Sign in</button>',
  ];
  return `<form class="sign-in-card" method="post" action="/sign-in">${parts.join('')}</form>`;
}

/**
 * The sign-in page. `options` carries the stylesheet to inline, the package
 * version for the colophon, and whether to say the credential did not match.
 */
export function renderSignIn(options) {
  const { css, version, failed } = options;
  const nav = `<nav class="nav"><div class="nav-inner">${brand()}</div></nav>`;
  const main = `<main class="scroll"><div class="page sign-in">${form(failed)}${colophon(version)}</div></main>`;
  return [
    ...documentHead({ title: TITLE, description: DESCRIPTION, css }),
    '<body>',
    nav,
    main,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
