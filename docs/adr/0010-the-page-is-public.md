# ADR 0010: The page is public; the sign-in is removed

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Ian Lindsley, at the vision owners' request
- **Task:** Issue #55
- **Supersedes:** [ADR 0006](0006-the-page-behind-a-shared-password.md),
  [ADR 0007](0007-a-sign-in-page-and-a-signed-cookie.md)
- **Amends:** [ADR 0008](0008-the-mcp-server-standard-is-published-at-standard.md),
  decision 4; [ADR 0003](0003-one-router-worker-at-the-apex.md), decision 7
  (restored to its original wording)
- **Depends on:** [ADR 0002](0002-url-naming-convention.md),
  [ADR 0003](0003-one-router-worker-at-the-apex.md)

## Context

On 2026-10-30 the page at `/` and the HTML view of `/mcp` were put behind one
shared username and password, at the vision owner's request, "while some
strategic questions are settled" (ADR 0006). ADR 0007 replaced the browser's
login box with a sign-in page and a signed cookie, and ADR 0008 put the
standard at `/standard` behind the same sign-in. ADR 0006 decision 7 said the
gate was temporary by intent and that removing it would be one pull request.

On 2026-11-18 the vision owners, who asked for the gate, asked for it to be
lifted, so that anyone can open `servant.bible` in a browser. Ian Lindsley
confirmed the request the same day. This record is that removal.

Nothing a program calls was ever gated (ADR 0006, decision 1), so this
decision changes only what a person in a browser meets.

## Decision

1. **The page is public.** `GET` and `HEAD` on `/`, on `/mcp` when the request
   accepts HTML, and on `/standard` answer the page to everyone. Nothing at
   `servant.bible` asks for a credential.
2. **`/sign-in` and `/sign-out` stop existing.** They are not addresses any
   more and answer `404` like any unknown path, for every method. The sign-out
   control leaves the page and the standard.
3. **The gate is removed, not switched off.** The gate, the cookie, and the
   token code, the sign-in pages and their build step, and their tests are
   deleted. There is no flag that brings the gate back; putting a gate in
   front of the page again would be a new decision and a new record.
4. **The router holds no secrets.** `PAGE_USERNAME`, `PAGE_PASSWORD`, and
   `PAGE_COOKIE_SECRET` are no longer read by the Worker, uploaded by a deploy,
   or required for a deploy to run. ADR 0003 decision 7 reads as first
   written, with no exception. After production is verified, the repository
   owner deletes the three Worker secrets from both Workers and the six
   repository secrets; until then they exist and nothing reads them.
5. **The page is answered with the asset layer's own caching headers.** The
   gate marked every page response `private, no-store` because the response
   was a secret. It no longer is, so the router stops overwriting
   `cache-control`: the asset layer's headers pass through. As deployed that
   is `public, max-age=0, must-revalidate`, so nothing stale is kept and a
   deploy shows on the next request. The deployed page carries no `ETag`
   (observed on both environments on 2026-11-19, although the local Workers
   runtime sends one), so a browser fetches the page again on each visit
   rather than receiving a `304`.
6. **`/mcp` answers `Vary: Accept`.** The address gives the page to a request
   that accepts HTML and the list as JSON to everything else. With the page
   now cacheable, both answers name `Accept` in `Vary`, so a cache never hands
   one in place of the other.
7. **A cookie a browser still holds is ignored.** A browser that signed in
   keeps the page cookie for up to 30 days. The router no longer reads it and
   no longer removes it from a forwarded request (ADR 0007, decision 6, goes
   with the rest).

## Consequences

- Anyone can read the page, the browser view of the list, and the standard.
  Everything they show was already public through `/mcp.json` and the
  repository.
- A deploy no longer depends on six repository secrets being present, and the
  "Assert the page credential is present" step leaves both deploy workflows.
- Until a leftover page cookie expires, a browser that signed in and then
  makes a request to a `/org/...` or `/s/...` address sends that cookie to the
  backend. The cookie is an expiry and an HMAC under a secret that is being
  deleted; it carries no credential and unlocks nothing, here or upstream.
- [#41](https://github.com/unfoldingWord/servant.bible/issues/41), a rate
  limit on `POST /sign-in`, has nothing left to protect and is closed.
- ADR 0006 and ADR 0007 stay in the repository as the record of what was
  decided and why, marked superseded.
- `CLAUDE.md` and the README stop describing a gate. The rule that Claude
  never runs `wrangler secret` and never puts a credential in the repository
  stays: it was never only about the page.
