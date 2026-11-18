# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository. These rules are
non-negotiable. The ones about deploys, merges, and gates exist so that nothing
reaches `servant.bible` without review, and so that the gates stay honest.

## Decisions live in `docs/adr/`

Every design decision about Servant.Bible is an architecture decision record
under [`docs/adr/`](docs/adr/), indexed in [`docs/README.md`](docs/README.md).
Read them before working any issue. Most issues cite the ADRs they rest on;
when one does not, find the ADRs that apply anyway. In short:

- **ADR 0001**: BT Servant is the conversation product; Servant.Bible is the
  resource layer any agent can call. No BT Servant code changes for this split.
- **ADR 0002**: addresses are path style under the bare domain
  (`servant.bible/org/<org>/server/<server>/mcp`, `/s/<shorthand>`, `/mcp`).
- **ADR 0003**: one router Worker in this repository owns the apex. The server
  list is its configuration. It proxies, never redirects, and holds no secrets.
- **ADR 0004**: a server earns an address by being listed and fronted, not by
  being re-hosted.
- **ADR 0005**: the list holds servers and datasets, each with a `kind` and a
  `status`; nothing listed is hidden; `purpose` and `sources` are per entry;
  the file is JSON, checked against `servers.schema.json` in CI.
- **ADR 0006**: the page at `/` and the HTML view of `/mcp` are behind one
  shared username and password, held as Worker secrets; nothing a program
  calls is gated; the gate fails closed.
- **ADR 0009**: two long-lived branches. `develop` is the integration branch
  and staging follows it; `main` is the release branch and production deploys
  only from a `v*` tag on it.

A new decision is a new ADR plus a row in `docs/README.md`, never a comment in
code or an issue. If an issue and an ADR disagree, stop and raise it.

## Two branches: `develop` and `main`

Never push to `develop` or `main`. Every change goes on a branch and through a
pull request (ADR 0009).

- **`develop`** is the integration branch and the default branch. Branch from
  it and open every pull request against it. It is always releasable: work
  that is not ready stays on its own branch.
- **`main`** is the release branch. It receives only `develop` (a release
  pull request, titled "Release vX.Y.Z: develop → main") or a `hotfix/*`
  branch. CI's `Release Source` job refuses anything else. Only the
  repository owner merges into `main`.
- **Never cherry-pick into `main`.** If something on `develop` must not ship,
  revert it on `develop`, then release.
- **Merge methods.** A pull request into `develop` is squash merged and must
  be up to date with `develop` first. A release or hotfix pull request into
  `main` uses a merge commit, never squash or rebase; a ruleset on `main`
  enforces it. Never delete `develop` when merging a release.
- **Hotfix.** Branch from `main` as `hotfix/<name>`, bump the version, open
  the pull request into `main`, then open one from `main` into `develop` the
  same day so `develop` stays ahead.

Both branches are protected: CI must pass, force pushes and deletions are
refused, and the rules apply to administrators too. The rules are recorded in
`.github/branch-protection.json`. `pnpm protection:check` compares them with
the live settings. Change them only by changing that file in a pull request;
`pnpm protection:apply` is the user's step, or Claude's only on an explicit
yes.

## Never deploy by hand

**Never run `wrangler deploy`.** Deployments run from CI only:

- **Staging** deploys automatically when CI passes on `develop` after a merge
  (`.github/workflows/deploy-staging.yml`).
- **Production** deploys only by manual dispatch of the Deploy workflow on a
  release tag (`gh workflow run deploy.yml --ref v<version>`), never
  automatically. The workflow refuses anything but a `v*` tag whose commit is
  on `main`. Dispatching it is the user's step, not Claude's.

Both report their version at `/health`: `staging.servant.bible/health` and
`servant.bible/health`. Verify a deploy with one request there.

The page at `/` is behind a shared username and password (ADR 0006). The
credential is two Worker secrets that only the deploy workflows set, from the
GitHub repository secrets named in the README. **Never run `wrangler secret`**,
never put a credential in `wrangler.toml`, `.dev.vars.example`, a test, an
issue, or a pull request. Nothing a program calls is gated; keep it that way.

## Never merge without review

After CI is green on a pull request, say **"Ready for codex code review."**
and stop. Code review is run by the user with Codex, not by Claude. Then:

1. The user pastes the findings back.
2. Fix every finding, whatever its severity, and push.
3. Say "Ready for codex code review." again. Repeat until the review is clean.
4. Ask the user whether to merge. Merge only on an explicit yes. A release
   or hotfix pull request into `main` is merged by the user.

Do not arrange a review of your own, and do not skip or shortcut the loop.

## Commit author rules

1. Claude is the **sole author** of its commits. Use
   `--author="Claude <claude@anthropic.com>"` on every commit. No
   `Co-Authored-By` lines, no "Generated with" footer, no user name.
2. Every commit has a subject **and** a body. Neither is blank.
3. The pre-commit hook must pass. Never commit while it fails; fix the cause.
4. Never use `--no-verify` or any other way around the hook.

## Version bump per pull request

Every pull request bumps `package.json`. Ask the user which before bumping:

- **Patch** (`pnpm version patch --no-git-tag-version`): fixes, docs, config.
- **Minor** (`pnpm version minor --no-git-tag-version`): new routes, new
  fields in the list, behaviour changes.

The `version` hook regenerates `src/generated/version.ts` and stages it. A
release pull request (`develop` into `main`) carries no bump of its own: it
ships the versions its pull requests already bumped. After a release merges,
CI tags `main` with `v<version>` (`.github/workflows/tag.yml`). `develop` is
never tagged, and no tag is ever created by hand.

## Never weaken the gates

The gates are ESLint (with the function length, statement, complexity, depth,
callback, and parameter caps in `eslint.config.js`), Prettier, `tsc`, Vitest in
the Workers runtime, the build, the two-layer dependency audit, and the
`servers.json` schema check (`pnpm validate:servers`). They run in the
pre-commit hook and in CI on `src/`, `tests/`, and `scripts/` alike.

Never: add `eslint-disable`, raise a cap, add `|| true`, change an audit
threshold, skip a hook, or exclude a path. A vulnerable transitive dependency
is fixed with a `pnpm.overrides` pin in `package.json`, not by lowering the
bar. If a gate seems wrong, ask the user before touching it.

## Never silently swallow errors

No empty `catch`, no `catch` that only comments, no `void` on a promise whose
failure is unobserved. Every failure is logged with context, or re-thrown, or
turned into an error response. Never log request or response bodies: they
carry user questions and Bible text.

## Before writing code

1. Say how the change will be verified (tests, `curl`, a CI run).
2. Write the test first.
