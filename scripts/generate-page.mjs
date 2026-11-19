#!/usr/bin/env node
/**
 * Generate public/index.html from servers.json (#9), and beside it the MCP
 * server standard rendered from docs/mcp-standard.md (ADR 0008),
 * standard.html.
 *
 * The pages are built, never hand-edited: the router serves whatever is in
 * public/, and the files are gitignored so they cannot drift from the list,
 * the standard, or the stylesheet. The list is validated first and an
 * invalid list fails the build with every error named, so a bad entry never
 * reaches a deploy; a standard with Markdown the renderer does not know
 * fails it the same way, naming the line.
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
import { renderStandard } from './page/standard.mjs';
import { validateServers } from './validate-servers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

const DEFAULTS = {
  serversPath: path.join(REPO_ROOT, 'servers.json'),
  schemaPath: path.join(REPO_ROOT, 'servers.schema.json'),
  standardPath: path.join(REPO_ROOT, 'docs', 'mcp-standard.md'),
  outPath: path.join(REPO_ROOT, 'public', 'index.html'),
};

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The standard's file name, beside index.html; the router fetches it by this path (ADR 0008). */
export const STANDARD_FILE = 'standard.html';

/** The validated list, or the error naming every problem. */
function readList(serversPath, schemaPath) {
  const doc = readJson(serversPath);
  const errors = validateServers(doc, readJson(schemaPath));
  if (errors.length > 0) {
    const listed = errors.map((error) => `  ${error}`).join('\n');
    throw new Error(`${serversPath} is invalid, page not generated:\n${listed}`);
  }
  return doc;
}

/** The standard's page, or the renderer's error with the file named before the line. */
function readStandard(standardPath, css, version) {
  const markdown = readFileSync(standardPath, 'utf8');
  try {
    return renderStandard({ markdown, css, version });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${standardPath} ${message}`, { cause: error });
  }
}

/**
 * Validate the list, render the page and the standard, write the standard
 * beside `outPath`, and return the page's HTML. Throws, writing nothing, when
 * the list fails the schema or the standard has Markdown the renderer does
 * not know.
 */
export function generatePage(paths = {}) {
  const { serversPath, schemaPath, standardPath, outPath } = { ...DEFAULTS, ...paths };
  const doc = readList(serversPath, schemaPath);
  const css = readFileSync(path.join(HERE, 'page', 'page.css'), 'utf8');
  const version = readJson(path.join(REPO_ROOT, 'package.json')).version;
  const script = readFileSync(path.join(HERE, 'page', 'copy.js'), 'utf8');
  const standard = readStandard(standardPath, css, version);
  const html = renderPage(doc, { css, script, version });
  const dir = path.dirname(outPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  writeFileSync(path.join(dir, STANDARD_FILE), standard, 'utf8');
  return html;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const html = generatePage();
    const relative = path.relative(REPO_ROOT, DEFAULTS.outPath);
    console.log(`Generated ${relative} (${html.length} characters) and ${STANDARD_FILE} beside it`);
  } catch (error) {
    console.error(`generate-page: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
