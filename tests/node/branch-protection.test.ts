import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  type BranchRules,
  differences,
  protectionPayload,
  readProtection,
  readRuleset,
  rulesetPayload,
} from '../../scripts/branch-protection.mjs';

/**
 * ADR 0009, decision 8: the branch protection is recorded in
 * .github/branch-protection.json and applied and checked by
 * scripts/branch-protection.mjs. These tests pin the recorded rules, and that
 * the script reads GitHub's answers and writes its requests in the same terms,
 * so `--check` cannot pass on a setting that differs.
 */

interface Recorded {
  branches: { develop: BranchRules; main: BranchRules };
  ruleset: { name: string; enforcement: string; branches: string[]; mergeMethods: string[] };
}

const RECORDED = JSON.parse(readFileSync('.github/branch-protection.json', 'utf8')) as Recorded;
const { develop, main } = RECORDED.branches;
const CI_CHECKS = ['Build', 'Lint', 'Security Audit', 'Test', 'Type Check'];

/** GitHub's GET answer for a branch protected exactly as `rules` says. */
function liveProtection(rules: BranchRules) {
  const logins = (names: string[]) => names.map((login) => ({ login, id: 1 }));
  return {
    url: 'https://api.github.com/x',
    required_status_checks: { strict: rules.checksUpToDate, contexts: [...rules.checks].reverse() },
    enforce_admins: { enabled: rules.appliesToAdmins },
    required_pull_request_reviews: {
      dismiss_stale_reviews: rules.dismissStaleReviews,
      require_code_owner_reviews: rules.codeOwnerReview,
      require_last_push_approval: rules.lastPushApproval,
      required_approving_review_count: rules.approvals,
      bypass_pull_request_allowances: {
        users: logins(rules.mayMergeWithoutReview),
        teams: [],
        apps: [],
      },
    },
    ...(rules.pushRestrictedTo
      ? { restrictions: { users: logins(rules.pushRestrictedTo), teams: [], apps: [] } }
      : {}),
    required_linear_history: { enabled: rules.linearHistory },
    required_conversation_resolution: { enabled: rules.conversationsResolved },
    allow_force_pushes: { enabled: rules.forcePushes },
    allow_deletions: { enabled: rules.deletions },
  };
}

describe('the recorded rules (ADR 0009, decision 8)', () => {
  it('develop requires the five CI checks, up to date, and one approval', () => {
    expect(develop.checks).toEqual(CI_CHECKS);
    expect(develop.checksUpToDate).toBe(true);
    expect(develop.approvals).toBe(1);
    expect(develop.linearHistory).toBe(true);
    expect(develop.pushRestrictedTo).toBeNull();
  });

  it('main also requires Release Source, a code owner, and approval of the last push', () => {
    expect(main.checks).toEqual([...CI_CHECKS, 'Release Source'].sort());
    expect(main.codeOwnerReview).toBe(true);
    expect(main.lastPushApproval).toBe(true);
    expect(main.pushRestrictedTo).toEqual(['IanLindsley']);
    expect(main.linearHistory).toBe(false);
  });

  it.each([
    ['develop', develop],
    ['main', main],
  ])('%s applies to administrators and refuses force pushes and deletions', (_, rules) => {
    expect(rules.appliesToAdmins).toBe(true);
    expect(rules.forcePushes).toBe(false);
    expect(rules.deletions).toBe(false);
    expect(rules.conversationsResolved).toBe(true);
  });

  it('main accepts merge commits only', () => {
    expect(RECORDED.ruleset.branches).toEqual(['refs/heads/main']);
    expect(RECORDED.ruleset.mergeMethods).toEqual(['merge']);
    expect(RECORDED.ruleset.enforcement).toBe('active');
  });
});

describe('readProtection', () => {
  it.each([
    ['develop', develop],
    ['main', main],
  ])("reads GitHub's answer for %s back as the recorded rules", (_, rules) => {
    expect(differences('x', rules, readProtection(liveProtection(rules)))).toEqual([]);
  });

  it("reads today's main, which has no review rules, as weaker than the record", () => {
    const today = {
      required_status_checks: { strict: false, contexts: CI_CHECKS },
      enforce_admins: { enabled: true },
      required_pull_request_reviews: {
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
        require_last_push_approval: false,
        required_approving_review_count: 0,
      },
      required_linear_history: { enabled: false },
      required_conversation_resolution: { enabled: false },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
    };
    const found = differences('main', main, readProtection(today)).join('\n');
    expect(found).toContain('main checks: want');
    expect(found).toContain('main codeOwnerReview: want true, have false');
    expect(found).toContain('main pushRestrictedTo: want ["IanLindsley"], have null');
    expect(found).not.toContain('forcePushes');
  });
});

describe('differences', () => {
  it('says so when the branch is not protected at all', () => {
    expect(differences('develop', develop, null)).toEqual(['develop: not configured']);
  });

  it('names each setting that differs, with both values', () => {
    const have = { ...develop, approvals: 0, linearHistory: false };
    expect(differences('develop', develop, have)).toEqual([
      'develop approvals: want 1, have 0',
      'develop linearHistory: want true, have false',
    ]);
  });

  it('does not mind the order of a list', () => {
    const have = { ...main, checks: [...main.checks].reverse() };
    expect(differences('main', main, have)).toEqual([]);
  });
});

describe('protectionPayload', () => {
  it('asks GitHub for exactly what readProtection would read back', () => {
    const body = protectionPayload(main);
    expect(body).toMatchObject({
      required_status_checks: { strict: false, contexts: main.checks },
      enforce_admins: true,
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        require_last_push_approval: true,
        required_approving_review_count: 1,
        bypass_pull_request_allowances: { users: ['IanLindsley'], teams: [], apps: [] },
      },
      restrictions: { users: ['IanLindsley'], teams: [], apps: [] },
      required_linear_history: false,
      required_conversation_resolution: true,
      allow_force_pushes: false,
      allow_deletions: false,
    });
  });

  it('sends null restrictions for a branch anyone may merge into', () => {
    expect(protectionPayload(develop).restrictions).toBeNull();
  });
});

describe('the ruleset', () => {
  it('round-trips through its payload', () => {
    const body = rulesetPayload(RECORDED.ruleset);
    expect(body).toMatchObject({ target: 'branch', enforcement: 'active' });
    expect(differences('ruleset', RECORDED.ruleset, readRuleset(body))).toEqual([]);
  });

  it('is read as different when squash is also allowed', () => {
    const body = rulesetPayload({ ...RECORDED.ruleset, mergeMethods: ['merge', 'squash'] });
    expect(differences('ruleset', RECORDED.ruleset, readRuleset(body))).toEqual([
      'ruleset mergeMethods: want ["merge"], have ["merge","squash"]',
    ]);
  });
});
