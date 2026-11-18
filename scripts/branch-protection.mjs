#!/usr/bin/env node
/**
 * Branch protection as a file (ADR 0009, decision 8).
 *
 *   pnpm protection:check   compare GitHub's settings with the file; exit 1 on any difference
 *   pnpm protection:apply   set GitHub's settings from the file, then check
 *
 * The rules live in .github/branch-protection.json: one entry per protected
 * branch, and the ruleset that allows only merge commits into main. They are
 * repository settings, not files GitHub reads, so nothing applies them on a
 * merge: a person with admin access runs `protection:apply` after changing the
 * file, and `protection:check` at any time to prove the settings still match.
 *
 * Both commands call the GitHub API through `gh`, as whoever `gh` is signed in
 * as. Reading branch protection needs admin access, which the token CI gets
 * does not have, so the check is not a CI job.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES_FILE = path.join(REPO_ROOT, '.github', 'branch-protection.json');

/**
 * GitHub names three kinds of actor in a bypass or push list: users, teams,
 * and apps. All three are read, so a team or an app someone adds later shows
 * up as a difference. In the file a user is its login, a team is
 * `team:<slug>`, and an app is `app:<slug>`.
 */
function readActors(list) {
  return [
    ...(list?.users ?? []).map((user) => user.login),
    ...(list?.teams ?? []).map((team) => `team:${team.slug}`),
    ...(list?.apps ?? []).map((app) => `app:${app.slug}`),
  ];
}

/** The file's actor names, split back into the three lists GitHub takes. */
function actors(names) {
  const slugs = (prefix) =>
    names.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
  return {
    users: names.filter((n) => !n.includes(':')),
    teams: slugs('team:'),
    apps: slugs('app:'),
  };
}

/** Whether one of GitHub's `{ enabled }` settings is on. */
const on = (setting) => setting?.enabled === true;

function readChecks(checks) {
  return { checks: checks?.contexts ?? [], checksUpToDate: checks?.strict === true };
}

function readReviews(reviews) {
  return {
    approvals: reviews?.required_approving_review_count ?? 0,
    codeOwnerReview: reviews?.require_code_owner_reviews === true,
    lastPushApproval: reviews?.require_last_push_approval === true,
    dismissStaleReviews: reviews?.dismiss_stale_reviews === true,
    mayMergeWithoutReview: readActors(reviews?.bypass_pull_request_allowances),
  };
}

/** GitHub's answer to GET .../branches/<branch>/protection, in the file's terms. */
export function readProtection(live) {
  return {
    ...readChecks(live.required_status_checks),
    ...readReviews(live.required_pull_request_reviews),
    pushRestrictedTo: live.restrictions ? readActors(live.restrictions) : null,
    linearHistory: on(live.required_linear_history),
    conversationsResolved: on(live.required_conversation_resolution),
    appliesToAdmins: on(live.enforce_admins),
    forcePushes: on(live.allow_force_pushes),
    deletions: on(live.allow_deletions),
  };
}

/** The body for PUT .../branches/<branch>/protection that sets these rules. */
export function protectionPayload(rules) {
  return {
    required_status_checks: { strict: rules.checksUpToDate, contexts: rules.checks },
    enforce_admins: rules.appliesToAdmins,
    required_pull_request_reviews: {
      dismiss_stale_reviews: rules.dismissStaleReviews,
      require_code_owner_reviews: rules.codeOwnerReview,
      require_last_push_approval: rules.lastPushApproval,
      required_approving_review_count: rules.approvals,
      bypass_pull_request_allowances: actors(rules.mayMergeWithoutReview),
    },
    restrictions: rules.pushRestrictedTo ? actors(rules.pushRestrictedTo) : null,
    required_linear_history: rules.linearHistory,
    required_conversation_resolution: rules.conversationsResolved,
    allow_force_pushes: rules.forcePushes,
    allow_deletions: rules.deletions,
  };
}

/** A list GitHub may leave out, as a list. */
const listOf = (value) => (Array.isArray(value) ? value : []);

/** GitHub's answer to GET .../rulesets/<id>, in the file's terms. */
export function readRuleset(live) {
  const refs = live.conditions?.ref_name;
  const rule = listOf(live.rules).find((r) => r.type === 'pull_request');
  return {
    name: live.name,
    enforcement: live.enforcement,
    branches: listOf(refs?.include),
    excludedBranches: listOf(refs?.exclude),
    mergeMethods: listOf(rule?.parameters?.allowed_merge_methods),
    bypassActors: listOf(live.bypass_actors).map(
      (a) => `${a.actor_type}:${a.actor_id}:${a.bypass_mode}`
    ),
  };
}

/** `<actor_type>:<actor_id>:<bypass_mode>` from the file, as GitHub's object. */
function bypassActor(text) {
  const [actorType, actorId, bypassMode] = text.split(':');
  return { actor_id: Number(actorId), actor_type: actorType, bypass_mode: bypassMode };
}

/**
 * The body for POST or PUT .../rulesets. The rule only limits the merge
 * method: reviews are branch protection's job, so its review settings are off.
 */
export function rulesetPayload(rules) {
  return {
    name: rules.name,
    target: 'branch',
    enforcement: rules.enforcement,
    conditions: { ref_name: { include: rules.branches, exclude: rules.excludedBranches } },
    bypass_actors: rules.bypassActors.map(bypassActor),
    rules: [
      {
        type: 'pull_request',
        parameters: {
          allowed_merge_methods: rules.mergeMethods,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: false,
        },
      },
    ],
  };
}

/** A value as comparable text; a list is compared without regard to order. */
function comparable(value) {
  return JSON.stringify(Array.isArray(value) ? [...value].sort() : value);
}

/** One line per setting where `have` differs from `want`; none means they match. */
export function differences(label, want, have) {
  if (have === null) return [`${label}: not configured`];
  const having = new Map(Object.entries(have));
  const lines = [];
  for (const [key, wanted] of Object.entries(want)) {
    const [w, h] = [comparable(wanted), comparable(having.get(key) ?? null)];
    if (w !== h) lines.push(`${label} ${key}: want ${w}, have ${h}`);
  }
  return lines;
}

/** Call the GitHub API through gh. `body`, when given, is sent as JSON. */
function gh(method, endpoint, body) {
  const args = ['api', '-X', method, endpoint];
  const options = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
  if (body !== undefined) {
    args.push('--input', '-');
    options.input = JSON.stringify(body);
  }
  return JSON.parse(execFileSync('gh', args, options) || 'null');
}

/** A GET that answers null for 404 (nothing configured) and throws for anything else. */
function ghOrNull(endpoint) {
  try {
    return gh('GET', endpoint);
  } catch (error) {
    if (String(error.stderr).includes('HTTP 404')) return null;
    const detail = String(error.stderr || error.message).trim();
    throw new Error(`GET ${endpoint} failed: ${detail}`, { cause: error });
  }
}

function liveRuleset(repository, name) {
  const found = gh('GET', `repos/${repository}/rulesets`).find((r) => r.name === name);
  return found ? gh('GET', `repos/${repository}/rulesets/${found.id}`) : null;
}

function check({ repository, branches, ruleset }) {
  const lines = [];
  for (const [branch, rules] of Object.entries(branches)) {
    const live = ghOrNull(`repos/${repository}/branches/${branch}/protection`);
    lines.push(...differences(branch, rules, live && readProtection(live)));
  }
  const live = liveRuleset(repository, ruleset.name);
  lines.push(...differences('ruleset', ruleset, live && readRuleset(live)));
  return lines;
}

function apply({ repository, branches, ruleset }) {
  for (const [branch, rules] of Object.entries(branches)) {
    gh('PUT', `repos/${repository}/branches/${branch}/protection`, protectionPayload(rules));
    console.log(`branch-protection: set ${branch}`);
  }
  const live = liveRuleset(repository, ruleset.name);
  const target = live ? `rulesets/${live.id}` : 'rulesets';
  gh(live ? 'PUT' : 'POST', `repos/${repository}/${target}`, rulesetPayload(ruleset));
  console.log(`branch-protection: set ruleset "${ruleset.name}"`);
}

function main(argv) {
  const recorded = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  if (argv.includes('--apply')) apply(recorded);
  const lines = check(recorded);
  if (lines.length === 0) {
    console.log(`branch-protection: ${recorded.repository} matches .github/branch-protection.json`);
    return 0;
  }
  console.error(`branch-protection: ${lines.length} setting(s) differ from the file:`);
  for (const line of lines) console.error(`  ${line}`);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`branch-protection: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
