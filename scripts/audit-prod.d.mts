/**
 * Types for scripts/audit-prod.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

/** One advisory that covers an installed version, at or above the threshold. */
export interface Finding {
  name: string;
  versions: string[];
  severity: string;
  title: string;
  url: string;
  vulnerable_versions: string;
  /** The GitHub advisory id from the advisory's URL, or null when it has none. */
  ghsa: string | null;
}

export interface AuditOptions {
  auditLevel: string;
  /** Advisory ids to leave out of the findings (ADR 0010). */
  ignoreGhsas: string[];
}

/**
 * Match the advisories the registry returned against the installed versions.
 * `findings` fail the audit; `ignored` are the ones `ignoreGhsas` names, kept
 * so the audit can still print them on every run.
 */
export function auditFindings(
  advisories: Record<string, unknown>,
  versionsByName: Map<string, Set<string>>,
  options: AuditOptions
): { findings: Finding[]; ignored: Finding[] };

/**
 * The advisory ids package.json lists under `pnpm.auditConfig.ignoreGhsas`.
 * Throws when the value is not a list of GitHub advisory ids.
 */
export function ignoredGhsas(pkg: object): string[];
