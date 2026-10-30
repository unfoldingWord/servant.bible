# ADR 0006: The page is behind a shared password, nothing else is

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Ian Lindsley, at the vision owner's request
- **Task:** Issue #35
- **Amends:** [ADR 0003](0003-one-router-worker-at-the-apex.md), decision 7
- **Depends on:** [ADR 0001](0001-separate-bt-servant-from-servant-bible.md), [ADR 0002](0002-url-naming-convention.md)

## Context

The router went live on `servant.bible` on 2026-10-29 (#11), and with it the
page at `/`. The same day the vision owner asked for v0.1 of the website to be
put behind a password while some strategic questions are settled: "moat the
whole thing" was the phrase, and the meeting of 2026-10-30 narrowed it to the
page itself. The reasons will be explained later; this record only decides how.

Two things are reachable at the apex and they are different in kind:

- **The page**, for people in a browser: `GET /`, and `GET /mcp` when the
  request says it wants HTML (ADR 0002).
- **The resource layer**, for programs: every server address under `/org/...`
  and `/s/...`, the list at `/mcp.json` and the JSON view of `/mcp`, the schema
  at `/servers.schema.json`, and `/health`. BT Servant's pool (#12) and any
  other agent call these. ADR 0001 exists so they can.

A gate on the hostname would block the second kind as well, which is the point
of Servant.Bible. A gate on the page alone changes nothing for a program.

ADR 0003 decision 7 says the router holds no secrets. That decision is about
server credentials: a bearer token for `fia` belongs to the caller, and the
router passes it through without ever holding it. A page password is a
different kind of secret, but it is still one, so this record amends that
decision rather than reading around it.

## Decision

1. **Only the page is gated.** `GET` and `HEAD` of `/`, and of `/mcp` when the
   request asks for HTML, require a credential. Every other path answers
   exactly as before. `/mcp.json` stays open on purpose: a program must not
   need a browser password to read the list.
2. **One shared username and password, by HTTP Basic authentication.** A
   browser shows its own login box; no sign-up, no session, no cookie, no page
   of our own. There is no account per person: the brief does not need to
   revoke one person or know who visited. If that changes, the per-person tool
   is Cloudflare Access with a one-time code to allowed email addresses, which
   is a new decision because it is configured outside this repository.
3. **The router holds this one secret and no other.** ADR 0003 decision 7 now
   reads: the router holds no credential for any server; it holds the page
   credential, which is never sent upstream. The credential lives in two
   Worker secrets, `PAGE_USERNAME` and `PAGE_PASSWORD`, set by the deploy
   workflows from GitHub repository secrets, one pair per environment. It is
   never in `wrangler.toml`, never in the repository, never set by hand.
4. **Both environments are gated**, `staging.servant.bible` and
   `servant.bible`, with different values, so the gate is exercised on staging
   before production, like everything else (ADR 0003, decision 3).
5. **The gate fails closed.** If an environment has no credential configured,
   the page answers `503` with a short JSON body and the router logs that the
   gate is not configured. It never falls open. The deploy workflows refuse to
   deploy when the repository secret is missing, so this state should not be
   reached.
6. **Comparison is constant time** and a gated page response carries
   `Cache-Control: private, no-store`, so neither a timing difference nor a
   shared cache leaks what the credential protects.
7. **The gate is temporary by intent.** Removing it is one pull request that
   deletes the check and the two secrets, and a new row in this table saying
   so. Nothing else depends on it.

## Consequences

- A browser at `servant.bible/` sees a login box. A program at
  `servant.bible/mcp.json` or any server address sees no change. BT Servant's
  move to the new addresses (#12) is unaffected.
- The gate hides the presentation, not the content: the list the page is built
  from is public at `/mcp.json` (ADR 0005, nothing listed is hidden). If the
  list itself must be hidden, that is a different decision and it would block
  agents.
- Rotating the credential is a change to the GitHub repository secrets and a
  deploy. Everyone who has the old one needs the new one; that is the cost of
  a shared credential and the reason it is enough for now.
- The page (#9), the brand work (#18, #19), and the map (#21) are built as
  before. The gate wraps whatever they produce.
- `wrangler dev` needs the two values in a local `.dev.vars`, which is
  ignored by git. Without them the local page answers `503`, the same as a
  deployment without its secrets.
