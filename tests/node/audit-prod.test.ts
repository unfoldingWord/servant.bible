import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { auditFindings, ignoredGhsas } from '../../scripts/audit-prod.mjs';

/**
 * The dependency audit may ignore an advisory only by its GitHub advisory id,
 * one id at a time, listed in package.json and recorded in ADR 0010. These
 * tests pin that an ignore is that narrow, and that every id in package.json
 * is one the ADR names.
 */

const PICOMATCH = 'GHSA-fc5q-39xc-vjpf';
const OTHER = 'GHSA-aaaa-bbbb-cccc';

function advisory(ghsa: string, overrides: Record<string, unknown> = {}) {
  return {
    severity: 'high',
    title: `advisory ${ghsa}`,
    url: `https://github.com/advisories/${ghsa}`,
    vulnerable_versions: '<=4.0.7',
    ...overrides,
  };
}

const INSTALLED = new Map([['picomatch', new Set(['4.0.7'])]]);
const HIGH = { auditLevel: 'high', ignoreGhsas: [] as string[] };

describe('auditFindings', () => {
  it('reports an advisory that covers an installed version', () => {
    const { findings, ignored } = auditFindings(
      { picomatch: [advisory(PICOMATCH)] },
      INSTALLED,
      HIGH
    );
    expect(findings.map((f) => f.ghsa)).toEqual([PICOMATCH]);
    expect(ignored).toEqual([]);
  });

  it('moves a listed advisory from the findings to the ignored list', () => {
    const { findings, ignored } = auditFindings({ picomatch: [advisory(PICOMATCH)] }, INSTALLED, {
      ...HIGH,
      ignoreGhsas: [PICOMATCH],
    });
    expect(findings).toEqual([]);
    expect(ignored.map((f) => `${f.name}@${f.versions.join(',')} ${f.ghsa}`)).toEqual([
      `picomatch@4.0.7 ${PICOMATCH}`,
    ]);
  });

  it('still reports a second advisory on the same package', () => {
    const { findings } = auditFindings(
      { picomatch: [advisory(PICOMATCH), advisory(OTHER)] },
      INSTALLED,
      { ...HIGH, ignoreGhsas: [PICOMATCH] }
    );
    expect(findings.map((f) => f.ghsa)).toEqual([OTHER]);
  });

  it('matches the id whatever its letter case', () => {
    const { findings } = auditFindings({ picomatch: [advisory(PICOMATCH)] }, INSTALLED, {
      ...HIGH,
      ignoreGhsas: [PICOMATCH.toLowerCase()],
    });
    expect(findings).toEqual([]);
  });

  it('cannot ignore an advisory that carries no advisory id', () => {
    const anonymous = advisory(PICOMATCH, { url: '' });
    const { findings } = auditFindings({ picomatch: [anonymous] }, INSTALLED, {
      ...HIGH,
      ignoreGhsas: [PICOMATCH, ''],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ghsa).toBeNull();
  });

  it('leaves out an advisory below the threshold or outside the installed versions', () => {
    const low = advisory(OTHER, { severity: 'moderate' });
    const old = advisory(PICOMATCH, { vulnerable_versions: '<4.0.0' });
    expect(auditFindings({ picomatch: [low, old] }, INSTALLED, HIGH).findings).toEqual([]);
  });
});

describe('ignoredGhsas', () => {
  it('is empty when package.json lists none', () => {
    expect(ignoredGhsas({})).toEqual([]);
    expect(ignoredGhsas({ pnpm: { overrides: {} } })).toEqual([]);
  });

  it('returns the listed ids', () => {
    expect(ignoredGhsas({ pnpm: { auditConfig: { ignoreGhsas: [PICOMATCH] } } })).toEqual([
      PICOMATCH,
    ]);
  });

  it.each([['picomatch'], ['*'], ['GHSA-fc5q'], [42]])('refuses %j as an id', (entry) => {
    expect(() => ignoredGhsas({ pnpm: { auditConfig: { ignoreGhsas: [entry] } } })).toThrow(/GHSA/);
  });

  it('refuses a list that is not a list', () => {
    expect(() => ignoredGhsas({ pnpm: { auditConfig: { ignoreGhsas: PICOMATCH } } })).toThrow(
      /list/
    );
  });
});

describe('the exceptions in package.json', () => {
  it('are exactly the ones ADR 0010 lists as open', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as object;
    const adr = readFileSync('docs/adr/0010-named-exceptions-to-the-dependency-audit.md', 'utf8');
    const open = adr.slice(adr.indexOf('## Open exceptions'));
    const listed = [...open.matchAll(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/g)].map((m) => m[0]);
    expect(ignoredGhsas(pkg).sort()).toEqual([...new Set(listed)].sort());
    expect(listed).toContain(PICOMATCH);
  });
});
