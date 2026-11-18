# ADR 0009: Two branches: `develop` for integration, `main` for releases

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** Ian Lindsley
- **Amends:** [ADR 0003](0003-one-router-worker-at-the-apex.md), decision 3
  (which branch staging follows)
- **Depends on:** [ADR 0003](0003-one-router-worker-at-the-apex.md),
  [ADR 0006](0006-the-page-behind-a-shared-password.md),
  [ADR 0007](0007-a-sign-in-page-and-a-signed-cookie.md)

## Context

Until now this repository had one long-lived branch. Every pull request merged
into `main`, a merge deployed staging, and production deployed when someone
dispatched the Deploy workflow from `main`. Two things follow from that shape:

- `main` is always whatever was merged last, not what production serves. There
  is no branch that means "released".
- Production could be dispatched from `main` at any moment, including the
  moment after a merge that staging has not yet served. Nothing made a release
  a deliberate, reviewed step of its own.

BT Servant's worker (`bt-servant-worker`) had the same shape and moved to two
branches on 2026-11-05. It then found three faults in its first version of the
workflows and fixed each: a release pull request deployed staging a second
time, a branch name reached a shell script by interpolation, and two merges
close together could deploy staging out of order. This repository adopts the
same model, with those fixes included from the start, so that the two
repositories work the same way and a contributor learns the rules once.

## Decision

1. **`develop` is the integration branch and the default branch.** Every
   feature branch starts from it and every pull request targets it. It is
   always releasable: work that is not ready stays on its own branch.
2. **`main` is the release branch.** It receives only `develop` (a release
   pull request) or a `hotfix/*` branch. CI's `Release Source` job fails any
   other pull request into `main`, so a feature branch cannot skip integration
   and staging. Nothing is cherry-picked into `main`; something on `develop`
   that must not ship is reverted on `develop` first.
3. **Staging follows `develop`.** It deploys after CI passes on a push to
   `develop`, never on a pull request. Staging deploys run one at a time, and
   a run whose commit is no longer the tip of `develop` skips, so staging
   never goes back to an older commit. This replaces "a merge to `main`
   deploys staging" in ADR 0003, decision 3; staging still proves a change
   before production does.
4. **Production deploys only from a `v*` tag whose commit is on `main`.** The
   Deploy workflow is still a manual dispatch. It refuses a branch before
   checking anything out, and refuses a tag that is not on `main` before
   installing or deploying anything.
5. **Release tags are cut automatically, on `main` only.** The Release Tag
   workflow tags `main` with `v<package.json version>` after CI passes on a
   push to it. Every pull request into `develop` still bumps the version; a
   release pull request carries no bump of its own. `develop` is never tagged.
   BT Servant's worker tags by hand; this repository already had the workflow
   and keeps it.
6. **Merge methods differ by branch.** Pull requests into `develop` are
   squash merged, and the branch must be up to date with `develop` first, so
   two pull requests that pass alone cannot break together. Release and hotfix
   pull requests into `main` use a merge commit, never squash or rebase. A
   squash would copy `develop`'s work into a commit `develop` does not
   contain, the branches would diverge, and every later release would list
   work that had already shipped.
7. **A hotfix** branches from `main` as `hotfix/<name>`, bumps the version,
   and merges into `main`. A pull request from `main` into `develop` follows
   the same day, so `develop` stays ahead of `main`.
8. **Branch protection matches BT Servant's worker, and is recorded in a
   file.** The rules are GitHub settings, not files GitHub reads, so they are
   written down in
   [`.github/branch-protection.json`](../../.github/branch-protection.json)
   and set from it by `scripts/branch-protection.mjs`:
   - `pnpm protection:apply` sets both branches and the ruleset from the
     file. A person with admin access runs it after the file changes.
   - `pnpm protection:check` reads the live settings and fails on any
     difference, so anyone with admin access can prove the settings still
     match. Reading branch protection needs admin access, which the token CI
     gets does not have, so the check is not a CI job.

   The file is the record. In short:
   - `develop`: pull request required, the five CI checks required and up to
     date, one approving review, stale reviews dismissed, linear history,
     conversations resolved, no force pushes or deletions, rules apply to
     administrators.
   - `main`: pull request required, the five CI checks plus `Release Source`
     required, one approving review from a code owner
     ([`.github/CODEOWNERS`](../../.github/CODEOWNERS)), approval of the last
     push, stale reviews dismissed, conversations resolved, pushes restricted
     to the repository owner, no force pushes or deletions, rules apply to
     administrators. A ruleset allows only merge commits.
   - On both, the repository owner may merge without the approving review, as
     in BT Servant's worker. The review loop in `CLAUDE.md` still applies to
     every pull request.

   These settings are a precondition of the model, not a follow-up: without
   them the `Release Source` job reports a failure that nothing requires, and
   a feature branch could still merge into `main`. They were applied on
   2026-11-18, before the pull request that introduced this record merged, and
   `pnpm protection:check` passed against the live repository.

## Consequences

- A change now takes two merges to reach production: into `develop`, then a
  release into `main`. Staging serves it in between, which is the point.
- `git log --first-parent main` lists one commit per release, and each has a
  `v*` tag.
- Tests in `tests/node/workflows-branching.test.ts` pin the trigger and guard
  of all four workflows, so a later edit cannot quietly undo this.
  `tests/node/branch-protection.test.ts` pins the recorded rules and how the
  script reads and writes them.
- The settings can still drift: someone with admin access can change them in
  GitHub's settings pages without touching the file. `pnpm protection:check`
  finds that, but only when someone runs it.
- Dependabot opens its pull requests against the default branch, so it
  follows `develop` with no change to its configuration.
- **A limit worth knowing.** A manual dispatch runs the workflow file from the
  ref it is dispatched on. Someone with push access could push a `v*` tag
  onto a commit whose `deploy.yml` has the guard removed. The guard stops
  mistakes, not a determined insider; the one-branch guard it replaces had
  the same limit. Closing it would take a tag ruleset or a protected
  deployment environment, which is a decision for a later ADR.
- The first release under this model is the proof of decision 4: until a
  `v*` tag is dispatched, the production guard is tested only as text.
