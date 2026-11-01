#!/usr/bin/env node
/**
 * Generate public/index.html from servers.json (#9), and beside it the two
 * sign-in pages the gate answers with (ADR 0007): sign-in.html and
 * sign-in-failed.html.
 *
 * The pages are built, never hand-edited: the router serves whatever is in
 * public/, and the files are gitignored so they cannot drift from the list
 * or the stylesheet. The list is validated first and an invalid list fails
 * the build with every error named, so a bad entry never reaches a deploy.
 *
 * Usage: node scripts/generate-page.mjs
 * Runs automatically via: prebuild, predev, and pretest (`pnpm run generate`).
 *
 * `generatePage` is exported for the tests in tests/node/.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPage } from './page/render.mjs';
import { renderSignIn } from './page/sign-in.mjs';
import { validateServers } from './validate-servers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

const DEFAULTS = {
  serversPath: path.join(REPO_ROOT, 'servers.json'),
  schemaPath: path.join(REPO_ROOT, 'servers.schema.json'),
  outPath: path.join(REPO_ROOT, 'public', 'index.html'),
};

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The sign-in pages' file names, beside index.html; the router fetches them by these paths. */
export const SIGN_IN_FILES = { plain: 'sign-in.html', failed: 'sign-in-failed.html' };

/**
 * Validate the list, render the page and the two sign-in pages, write them
 * beside `outPath`, and return the page's HTML. Throws, writing nothing,
 * when the list fails the schema.
 */
export function generatePage(paths = {}) {
  const { serversPath, schemaPath, outPath } = { ...DEFAULTS, ...paths };
  const doc = readJson(serversPath);
  const errors = validateServers(doc, readJson(schemaPath));
  if (errors.length > 0) {
    const listed = errors.map((error) => `  ${error}`).join('\n');
    throw new Error(`${serversPath} is invalid, page not generated:\n${listed}`);
  }
  const css = readFileSync(path.join(HERE, 'page', 'page.css'), 'utf8');
  const version = readJson(path.join(REPO_ROOT, 'package.json')).version;
  const script = readFileSync(path.join(HERE, 'page', 'copy.js'), 'utf8');
  const html = renderPage(doc, { css, script, version });
  const dir = path.dirname(outPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  writeFileSync(path.join(dir, SIGN_IN_FILES.plain), renderSignIn({ css, version, failed: false }));
  writeFileSync(path.join(dir, SIGN_IN_FILES.failed), renderSignIn({ css, version, failed: true }));
  return html;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const html = generatePage();
    const relative = path.relative(REPO_ROOT, DEFAULTS.outPath);
    const beside = Object.values(SIGN_IN_FILES).join(', ');
    console.log(`Generated ${relative} (${html.length} characters) and ${beside} beside it`);
  } catch (error) {
    console.error(`generate-page: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
