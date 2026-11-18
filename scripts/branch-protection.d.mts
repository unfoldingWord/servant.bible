/**
 * Types for scripts/branch-protection.mjs, so tests/node/ can import it under
 * `tsc --project tests/tsconfig.json` without `allowJs`.
 */

/** One branch's protection, in the shape .github/branch-protection.json uses. */
export interface BranchRules {
  checks: string[];
  checksUpToDate: boolean;
  approvals: number;
  codeOwnerReview: boolean;
  lastPushApproval: boolean;
  dismissStaleReviews: boolean;
  mayMergeWithoutReview: string[];
  pushRestrictedTo: string[] | null;
  linearHistory: boolean;
  conversationsResolved: boolean;
  appliesToAdmins: boolean;
  forcePushes: boolean;
  deletions: boolean;
}

export interface RulesetRules {
  name: string;
  enforcement: string;
  branches: string[];
  mergeMethods: string[];
}

/** GitHub's answer to GET .../branches/<branch>/protection, as BranchRules. */
export function readProtection(live: unknown): BranchRules;

/** The body for PUT .../branches/<branch>/protection that sets these rules. */
export function protectionPayload(rules: BranchRules): Record<string, unknown>;

/** GitHub's answer to GET .../rulesets/<id>, as RulesetRules. */
export function readRuleset(live: unknown): RulesetRules;

/** The body for POST or PUT .../rulesets that sets these rules. */
export function rulesetPayload(rules: RulesetRules): Record<string, unknown>;

/**
 * One line per setting where the live value differs from the wanted one, each
 * starting with `label`. `have` is null when nothing is configured at all.
 * An empty array means they match.
 */
export function differences(label: string, want: object, have: object | null): string[];
