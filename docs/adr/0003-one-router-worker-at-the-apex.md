# ADR 0003: One router Worker at the apex

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Ian Lindsley
- **Task:** Servant.Bible v0.1 task list, items 2 and 3
- **Implements:** [ADR 0002](0002-url-naming-convention.md)

## Context

ADR 0002 puts every Servant.Bible address under the bare domain, so something at
`servant.bible` itself has to answer every request and hand each one to the
right server. This record decides what that something is, where it runs, and
what has to change for it to run there.

### Where the domain is today (verified 2026-10-27)

- The `servant.bible` domain is registered at Epik, and Epik also runs its
  nameservers.
- The zone holds three records: the apex and `www` point at a web host that
  redirects to the Notion BT Servant page, and `tc-helps.mcp.servant.bible` is a
  CNAME to a Cloudflare Pages project on the unfoldingWord Cloudflare account.
  There are no mail or verification records.
- Cloudflare runs a Worker on a bare domain only when it hosts that domain's
  nameservers. Pointing a record elsewhere at Cloudflare does not work for the
  apex, and an HTTP redirect from the current host breaks MCP calls, because a
  redirect turns a POST into a GET in most clients.

## Decision

### Hosting

1. **Move the nameservers, not the domain.** Epik stays the registrar. The
   zone's nameservers change to the unfoldingWord Cloudflare account, where the
   other unfoldingWord zones already live. The three existing records are
   recreated in Cloudflare before the change so that nothing goes dark.
2. **The change is requested from unfoldingWord IT**, who administer the
   registrar account. This is the one step the Servant.Bible team cannot do and
   is the blocker for task 3.
3. **A second zone-level name, `staging.servant.bible`,** carries a staging
   deployment of the same router with its own copy of the server list. BT
   Servant staging points at it, so a new server or a new version is proven on
   staging before production's list changes. This mirrors how BT Servant itself
   is validated.

### The router

4. **One Cloudflare Worker, in the servant.bible repository, owns the apex.** It
   deploys from this repository and does three jobs: serve the page at `/`,
   serve the list at `/mcp` and `/mcp.json`, and route `/org/...` and `/s/...`
   to the real servers.
5. **The server list is the router's configuration.** The JSON file that task 4
   publishes is the same file the router reads. Adding a server is one entry in
   one file: it appears on the page, gets its canonical path, and gets its
   shorthand in one commit. There is no second place where routes are defined.
6. **Routing is a proxy, never a redirect.** The router forwards the request to
   the backend and streams the response back untouched, including the
   `Mcp-Session-Id` header and `text/event-stream` bodies that the streamable
   HTTP transport depends on. Request headers pass through as well, so a
   server that requires a bearer token receives the one the caller sent.
7. **The router holds no secrets.** Authentication is between the consumer and
   the server, exactly as it is today between BT Servant's pool and `fia-mcp`.
   If a server ever needs a key the router would have to inject, that is a new
   decision.
8. **Servers on the unfoldingWord Cloudflare account are reached by service
   binding** where possible, so the hop never leaves Cloudflare. Servers hosted
   elsewhere, such as a partner's own API, are reached by their public address.
9. **The router prefix is stripped** before the request reaches the server, so
   a server mounted at `/mcp` sees `/mcp`, and a versioned server sees
   `/v2/mcp`. Servers do not need to know their Servant.Bible path.

## Consequences

- **A new hop in BT Servant's hot path.** If the router is down, every resource
  server is unreachable from BT Servant. The mitigation is that the router is a
  small stateless Worker on the same platform BT Servant already depends on,
  with no storage and no external calls of its own. Its health is one more
  thing to watch.
- **Per-server observability in one place.** Every call to every server passes
  through the router, so request counts, latency, and error rates per server
  come for free, without each server having to report them.
- **The Notion redirect ends** when the router takes the apex. ADR 0002 puts
  the generated page at `/` instead.
- **`tc-helps.mcp.servant.bible` survives** as a legacy CNAME recreated in
  Cloudflare. No other subdomains are created.
- **Task 3 order becomes:** recreate records in Cloudflare, request the
  nameserver change, deploy the router with the current servers in its list,
  verify each canonical path answers, then update the BT Servant pool on
  staging and later production.
