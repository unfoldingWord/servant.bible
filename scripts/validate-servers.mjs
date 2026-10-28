#!/usr/bin/env node
/**
 * Validate servers.json against servers.schema.json.
 *
 * The schema (JSON Schema 2020-12) carries every per-entry rule. Three rules
 * span entries and cannot be written in JSON Schema, so they live here:
 *
 *   - org + server is unique across entries (ADR 0002: the canonical path)
 *   - shorthand is unique across all organizations (ADR 0002)
 *   - current names a key of versions (ADR 0002: the unversioned path)
 *
 * Usage: node scripts/validate-servers.mjs
 * Reads the two files at the repository root. Exit code 1 on any error. Runs
 * in the pre-commit hook and in CI (ADR 0005).
 *
 * `validateServers` is exported for the tests in tests/node/.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Compiled validators, one per schema object. */
const compiled = new WeakMap();

function validatorFor(schema) {
  const existing = compiled.get(schema);
  if (existing) return existing;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  compiled.set(schema, validate);
  return validate;
}

function formatError(error) {
  const where = error.instancePath === '' ? '/' : error.instancePath;
  const { additionalProperty, allowedValues } = error.params;
  let detail = '';
  if (additionalProperty !== undefined) detail = ` ("${additionalProperty}")`;
  else if (Array.isArray(allowedValues)) detail = ` (${allowedValues.join(', ')})`;
  return `${where} ${error.message}${detail}`;
}

function schemaErrors(doc, schema) {
  const validate = validatorFor(schema);
  if (validate(doc)) return [];
  return (validate.errors ?? []).map(formatError);
}

/**
 * Record `value` under `location`; return an error string if it was seen
 * before, otherwise undefined.
 */
function duplicateOf(seen, value, location, label) {
  const first = seen.get(value);
  if (first !== undefined) {
    return `${location} duplicate ${label} "${value}" (first at ${first})`;
  }
  seen.set(value, location);
  return undefined;
}

function currentError(entry, base) {
  if (entry.current === undefined) return undefined;
  if (entry.versions === undefined) {
    return `${base}/current "${entry.current}" is set but versions is missing`;
  }
  if (Object.hasOwn(entry.versions, entry.current)) return undefined;
  const known = Object.keys(entry.versions).join(', ');
  return `${base}/current "${entry.current}" is not a key of versions (${known})`;
}

/** The rules JSON Schema cannot express. Assumes the schema already passed. */
function crossEntryErrors(entries) {
  const errors = [];
  const servers = new Map();
  const shorthands = new Map();
  entries.forEach((entry, index) => {
    const base = `/entries/${index}`;
    const checks = [
      duplicateOf(servers, `${entry.org}/${entry.server}`, `${base}/server`, 'org/server'),
      entry.shorthand === undefined
        ? undefined
        : duplicateOf(shorthands, entry.shorthand, `${base}/shorthand`, 'shorthand'),
      currentError(entry, base),
    ];
    errors.push(...checks.filter((error) => error !== undefined));
  });
  return errors;
}

/**
 * Validate a parsed servers document against a parsed schema.
 * Returns one string per error, each starting with the JSON pointer of the
 * offending value. An empty array means the document is valid.
 */
export function validateServers(doc, schema) {
  const errors = schemaErrors(doc, schema);
  if (errors.length > 0) return errors;
  return crossEntryErrors(doc.entries);
}

function summarize(entries) {
  const servers = entries.filter((entry) => entry.kind === 'server').length;
  return `${entries.length} entries: ${servers} servers, ${entries.length - servers} datasets`;
}

function main() {
  const doc = JSON.parse(readFileSync(path.join(REPO_ROOT, 'servers.json'), 'utf8'));
  const schema = JSON.parse(readFileSync(path.join(REPO_ROOT, 'servers.schema.json'), 'utf8'));
  const errors = validateServers(doc, schema);
  if (errors.length === 0) {
    console.log(`validate-servers: servers.json is valid (${summarize(doc.entries)})`);
    return 0;
  }
  console.error(`validate-servers: servers.json has ${errors.length} error(s):`);
  for (const error of errors) console.error(`  ${error}`);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`validate-servers: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
