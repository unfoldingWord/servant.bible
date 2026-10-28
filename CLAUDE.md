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

A new decision is a new ADR plus a row in `docs/README.md`, never a comment in
code or an issue. If an issue and an ADR disagree, stop and raise it.

## Branch and pull request first

Never push to `main`. Every change goes on a branch and through a pull
request. `main` is protected: CI must pass, force pushes and deletions are
refused, and the rules apply to administrators too.

## Never deploy by hand

**Never run `wrangler deploy`.** Deployments run from CI only:

- **Staging** deploys automatically when CI passes on `main` after a merge
  (`.github/workflows/deploy-staging.yml`).
- **Production** deploys only by manual dispatch of the Deploy workflow
  (`.github/workflows/deploy.yml`), never automatically.

Both report their version at `/health`: `staging.servant.bible/health` and
`servant.bible/health`. Verify a deploy with one request there.

## Never merge without review

After CI is green on a pull request, say **"Ready for codex code review."**
and stop. Code review is run by the user with Codex, not by Claude. Then:

1. The user pastes the findings back.
2. Fix every finding, whatever its severity, and push.
3. Say "Ready for codex code review." again. Repeat until the review is clean.
4. Ask the user whether to merge. Merge only on an explicit yes.

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

The `version` hook regenerates `src/generated/version.ts` and stages it. After
the merge, CI tags `main` with `v<version>` (`.github/workflows/tag.yml`).

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
