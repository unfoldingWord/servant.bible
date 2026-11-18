#!/usr/bin/env node
/**
 * Dependency audit, in two layers (the bt-servant-worker policy):
 *
 *   pnpm audit:prod   production tree, fails on ANY severity
 *   pnpm audit:all    full tree (--include-dev), fails on high or critical
 *
 * Replaces `pnpm audit` because npm retired the v1 audit endpoints on
 * 2026-04-14 and no released pnpm queries the replacement yet. Ported from
 * bt-servant-worker's scripts/audit-prod.mjs. Remove this file and switch the
 * two scripts back to `pnpm audit` once a released pnpm uses the bulk endpoint.
 *
 * The script walks the dependency tree via `pnpm list`, POSTs it to the live
 * `/-/npm/v1/security/advisories/bulk` endpoint, matches each advisory's
 * vulnerable range against the installed versions with `semver.satisfies`,
 * and exits non-zero on any finding at or above the threshold.
 *
 * Exceptions (ADR 0010): an advisory is left out of the findings only when
 * its GitHub advisory id is listed in package.json under
 * `pnpm.auditConfig.ignoreGhsas`, the setting `pnpm audit` itself reads. One
 * id names one advisory; there is no way to ignore a package or a severity.
 * Every ignored advisory is still printed on every run.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GHSA_ID = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;
const GHSA_ID_ONLY = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/i;

const BULK_ENDPOINT = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];
const DEFAULT_AUDIT_LEVEL = 'low';

function parseArgs(argv) {
  const args = { auditLevel: DEFAULT_AUDIT_LEVEL, includeDev: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift();
    if (a === '--audit-level' && rest.length > 0) {
      args.auditLevel = rest.shift();
    } else if (a.startsWith('--audit-level=')) {
      args.auditLevel = a.slice('--audit-level='.length);
    } else if (a === '--include-dev') {
      args.includeDev = true;
    }
  }
  if (!SEVERITY_ORDER.includes(args.auditLevel)) {
    console.error(
      `audit-prod: invalid --audit-level ${JSON.stringify(args.auditLevel)} (expected one of ${SEVERITY_ORDER.join(', ')})`
    );
    process.exit(2);
  }
  return args;
}

/** Recursively records every installed version of every package in `deps`. */
function visitDependencies(deps, versionsByName) {
  if (!deps) return;
  for (const [name, info] of Object.entries(deps)) {
    if (!info || typeof info !== 'object') continue;
    if (typeof info.version === 'string') {
      if (!versionsByName.has(name)) versionsByName.set(name, new Set());
      versionsByName.get(name).add(info.version);
    }
    visitDependencies(info.dependencies, versionsByName);
  }
}

function collectDependencies(includeDev) {
  const listArgs = includeDev
    ? ['list', '--depth=Infinity', '--json']
    : ['list', '--prod', '--depth=Infinity', '--json'];
  const raw = execFileSync('pnpm', listArgs, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const versionsByName = new Map();
  for (const project of JSON.parse(raw)) {
    visitDependencies(project.dependencies, versionsByName);
    visitDependencies(project.devDependencies, versionsByName);
    visitDependencies(project.optionalDependencies, versionsByName);
  }
  return versionsByName;
}

async function fetchAdvisories(versionsByName) {
  const body = Object.fromEntries(
    Array.from(versionsByName, ([name, versions]) => [name, Array.from(versions)])
  );
  const response = await fetch(BULK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'servant-bible-audit/1.0',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${BULK_ENDPOINT} responded ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function severityAtLeast(severity, threshold) {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold);
}

/** Installed versions that fall inside the advisory's vulnerable range. */
function matchedVersions(installed, advisory) {
  const matched = [];
  for (const version of installed) {
    try {
      if (semver.satisfies(version, advisory.vulnerable_versions, { includePrerelease: true })) {
        matched.push(version);
      }
    } catch (err) {
      // A non-semver version string cannot match a semver range; say so and move on.
      console.warn(`audit-prod: skipping unparseable version ${version}: ${err.message}`);
    }
  }
  return matched;
}

/** The GitHub advisory id in the advisory's URL, as written there, or null. */
function ghsaOf(advisory) {
  const match = GHSA_ID.exec(typeof advisory.url === 'string' ? advisory.url : '');
  return match ? match[0] : null;
}

function findingsForPackage(name, pkgAdvisories, installed, auditLevel) {
  const findings = [];
  for (const advisory of pkgAdvisories) {
    const severity = advisory.severity ?? 'info';
    if (!severityAtLeast(severity, auditLevel)) continue;
    const versions = matchedVersions(installed, advisory);
    if (versions.length === 0) continue;
    findings.push({
      name,
      versions,
      severity,
      title: advisory.title ?? '(no title)',
      url: advisory.url ?? '',
      vulnerable_versions: advisory.vulnerable_versions ?? '',
      ghsa: ghsaOf(advisory),
    });
  }
  return findings;
}

/**
 * Match the advisories against the installed versions. `findings` fail the
 * audit; `ignored` are the ones `ignoreGhsas` names (ADR 0010). An advisory
 * with no advisory id can never be ignored.
 */
export function auditFindings(advisories, versionsByName, { auditLevel, ignoreGhsas }) {
  const ignore = new Set(ignoreGhsas.map((id) => String(id).toUpperCase()));
  const findings = [];
  const ignored = [];
  for (const [name, pkgAdvisories] of Object.entries(advisories)) {
    const installed = versionsByName.get(name);
    if (!Array.isArray(pkgAdvisories) || !installed) continue;
    for (const finding of findingsForPackage(name, pkgAdvisories, installed, auditLevel)) {
      const skip = finding.ghsa !== null && ignore.has(finding.ghsa.toUpperCase());
      (skip ? ignored : findings).push(finding);
    }
  }
  return { findings, ignored };
}

/**
 * The advisory ids package.json lists under `pnpm.auditConfig.ignoreGhsas`.
 * Anything that is not a full advisory id is refused, so a typo cannot turn
 * into a wider exception or a silent no-op.
 */
export function ignoredGhsas(pkg) {
  const list = pkg?.pnpm?.auditConfig?.ignoreGhsas;
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    throw new Error('pnpm.auditConfig.ignoreGhsas in package.json must be a list');
  }
  for (const id of list) {
    if (typeof id !== 'string' || !GHSA_ID_ONLY.test(id)) {
      throw new Error(
        `pnpm.auditConfig.ignoreGhsas: ${JSON.stringify(id)} is not a GHSA-xxxx-xxxx-xxxx id`
      );
    }
  }
  return list;
}

/** Ignored advisories are named on every run, so an exception is never silent. */
function printIgnored(ignored) {
  for (const f of ignored) {
    console.warn(
      `audit-prod: IGNORED by pnpm.auditConfig.ignoreGhsas (ADR 0010): [${f.severity}] ${f.name}@${f.versions.join(',')} ${f.ghsa}: ${f.title}`
    );
  }
}

function printReport(findings, auditLevel, scope) {
  if (findings.length === 0) {
    console.log(`audit-prod: no ${scope} vulnerabilities at or above "${auditLevel}".`);
    return;
  }
  const counts = new Map(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const f of findings) counts.set(f.severity, counts.get(f.severity) + 1);

  const plural = findings.length === 1 ? 'y' : 'ies';
  console.error(
    `audit-prod: found ${findings.length} ${scope} vulnerabilit${plural} at or above "${auditLevel}":\n`
  );
  for (const f of findings) {
    console.error(`  [${f.severity}] ${f.name}@${f.versions.join(',')}: ${f.title}`);
    console.error(`      vulnerable: ${f.vulnerable_versions}`);
    if (f.url) console.error(`      ${f.url}`);
  }
  console.error('');
  const summary = SEVERITY_ORDER.filter((s) => counts.get(s) > 0)
    .map((s) => `${counts.get(s)} ${s}`)
    .join(', ');
  console.error(`audit-prod summary: ${summary}`);
}

async function main() {
  const { auditLevel, includeDev } = parseArgs(process.argv.slice(2));
  const scope = includeDev ? 'production+dev' : 'production';
  const versionsByName = collectDependencies(includeDev);
  if (versionsByName.size === 0) {
    console.log(`audit-prod: no ${scope} dependencies to audit.`);
    return;
  }
  let advisories;
  try {
    advisories = await fetchAdvisories(versionsByName);
  } catch (err) {
    console.error(`audit-prod: failed to query advisory endpoint: ${err.message}`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const { findings, ignored } = auditFindings(advisories, versionsByName, {
    auditLevel,
    ignoreGhsas: ignoredGhsas(pkg),
  });
  printIgnored(ignored);
  printReport(findings, auditLevel, scope);
  if (findings.length > 0) process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`audit-prod: unexpected error: ${err.stack || err.message || err}`);
    process.exit(1);
  });
}
