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
 */

import { execFileSync } from 'node:child_process';
import semver from 'semver';

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
    });
  }
  return findings;
}

function findingsFor(advisories, versionsByName, auditLevel) {
  const findings = [];
  for (const [name, pkgAdvisories] of Object.entries(advisories)) {
    const installed = versionsByName.get(name);
    if (!Array.isArray(pkgAdvisories) || !installed) continue;
    findings.push(...findingsForPackage(name, pkgAdvisories, installed, auditLevel));
  }
  return findings;
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
  const findings = findingsFor(advisories, versionsByName, auditLevel);
  printReport(findings, auditLevel, scope);
  if (findings.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`audit-prod: unexpected error: ${err.stack || err.message || err}`);
  process.exit(1);
});
