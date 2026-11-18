# ADR 0010: The dependency audit may ignore one named advisory at a time

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Ian Lindsley
- **Depends on:** none

## Context

The dependency audit has two layers: the production tree fails on any
advisory, and the full tree fails on a high or critical one. `CLAUDE.md` says
how to clear a finding: pin a fixed version with `pnpm.overrides`, never lower
the bar.

On 2026-11-17 GitHub widened advisory `GHSA-fc5q-39xc-vjpf` (high) to cover
`picomatch` 4.0.7 and everything below it. 4.0.7 is the newest release, and
the advisory lists no patched version. There is nothing to pin to, so the
rule above cannot be followed, and the Security Audit job fails on every pull
request in this repository until `picomatch` ships a fix. The same advisory
stopped `uw-platform` the same day, and that repository ignored it by its id
(its pull request #133).

The audit here is a script, `scripts/audit-prod.mjs`, not `pnpm audit`, and
it had no way to make an exception at all. The only ways through were to wait
or to change a threshold, and changing a threshold would hide every other
high advisory too.

## Decision

1. **An advisory may be ignored only by its GitHub advisory id**, listed in
   `package.json` under `pnpm.auditConfig.ignoreGhsas`. That is the setting
   `pnpm audit` reads, so the list carries over when the script is retired.
   One id names one advisory. There is no way to ignore a package, a
   severity, or a layer, and the thresholds do not change.
2. **An exception is allowed only when no patched version exists** and the
   package cannot reasonably be removed. When a fix exists, the fix is a
   `pnpm.overrides` pin, as before.
3. **Every exception is listed below, by the repository owner's decision**,
   with why it is safe to wait and what ends it. A test fails if
   `package.json` and the list below disagree, so an id cannot be added
   without this record or left behind after the record is closed.
4. **An ignored advisory is printed on every audit run**, in CI and locally,
   marked `IGNORED`. An exception is never silent.
5. **A value that is not a full advisory id stops the audit** with an error.
   A typo cannot widen an exception or quietly do nothing.

## Consequences

- Pull requests can pass the Security Audit again while `picomatch` has no
  fix, and any other advisory, on `picomatch` or anything else, still fails.
- The audit script gains a small amount of logic, covered by
  `tests/node/audit-prod.test.ts`.
- An exception does not expire by itself. Someone has to watch for the fix.
  Dependabot's weekly pull request is the prompt: when it raises the package
  past the vulnerable range, remove the id and close the row below in the
  same change.

## Open exceptions

| Since      | Advisory              | Package and range    | Why it is safe to wait                                                                                                                                                                                                                                                                                                            | Ends when                                                                                      |
| ---------- | --------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-11-18 | `GHSA-fc5q-39xc-vjpf` | `picomatch` <= 4.0.7 | The flaw is a slow match on a crafted glob pattern. Only development tools use `picomatch` here (`vitest`, `@cloudflare/vitest-plugin`, `typescript-eslint`, `lint-staged`), and they match this repository's own file patterns, never outside input. The Worker has no production dependencies, so nothing deployed contains it. | `picomatch` publishes a patched version and the lockfile takes it. Remove the id and this row. |

## Closed exceptions

None yet.
