# ADR 0002: URL naming convention for Servant.Bible

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Ian Lindsley
- **Task:** Servant.Bible v0.1 task list, item 2
- **Depends on:** [ADR 0001](0001-separate-bt-servant-from-servant-bible.md)
- **Implemented by:** [ADR 0003](0003-one-router-worker-at-the-apex.md)

## Context

Every Model Context Protocol (MCP) server that Servant.Bible lists needs a stable
public address under `servant.bible`. Today the one server that has such an
address uses a subdomain, `tc-helps.mcp.servant.bible`, and two other servers
sit on Cloudflare `workers.dev` names. The v0.1 task list asks for one
convention, chosen before any server moves (task 3), and recorded where the team
can find it.

The task list's draft is path style: `servant.bible/org/<org>/server/<server>/mcp`,
with a shorthand `servant.bible/s/<server>` and a list of everything at
`servant.bible/mcp`. It names four entities: organization, server, resource, and
version.

Subdomains were considered. They need no router and are already in use, but each
new server needs its own DNS record, there is no single place for a catalog or a
shorthand, and per-server observability is scattered. Path style puts all of that
behind one address at the cost of one routing hop (see ADR 0003).

## Decision

**Path style, under the bare `servant.bible` domain.** Every address below is
served by one router on the apex (ADR 0003).

### The grammar

```
servant.bible/org/<org>/server/<server>/mcp              canonical endpoint, current version
servant.bible/org/<org>/server/<server>/<version>/mcp    pinned version
servant.bible/s/<server>                                 shorthand alias of the canonical endpoint
servant.bible/mcp                                        the list of all servers
servant.bible/                                           the Servant.Bible page (task 4)
```

Examples:

```
servant.bible/org/uw/server/tc-helps/mcp
servant.bible/org/uw/server/tc-helps/v2/mcp
servant.bible/org/uw/server/fia/mcp
servant.bible/org/klappy/server/aquifer/mcp      the community Aquifer server, run by Klappy
servant.bible/org/aquifer/server/aquifer/mcp     the official Aquifer server, run by the Aquifer team
servant.bible/s/aquifer                          whichever of the two the list marks as the shorthand
```

### Entities

| Entity | Where it lives | Rule |
| --- | --- | --- |
| **Organization** | path segment after `/org/` | The **operator**: the body or person that keeps the server alive, not the owner of the content it serves. Short lowercase slug: `uw`, `aquifer`, `klappy`, `tyndale`. Two operators may each offer a server with the same server slug; only the shorthand must be unique across them. |
| **Server** | path segment after `/server/` | One MCP server. Lowercase, hyphenated, unique within its organization: `tc-helps`, `fia`, `obs-5m`. |
| **Version** | optional path segment before `/mcp` | Explicit when pinned (`v1`, `v2`). When omitted, the address serves whichever version the list marks as current. A consumer that needs stability pins one. |
| **Resource** | the list, not the path | What a server covers (translation notes, dictionary, Bible text). One server covers many resources, so resource is metadata on the list entry, not an address. |

### Shorthand

`servant.bible/s/<server>` is an alias of the server's canonical endpoint. It is
the same endpoint, served the same way, not a redirect (ADR 0003 explains why a
redirect breaks MCP). Shorthand names are unique across all organizations and
are assigned in the list, so two organizations cannot both claim `/s/aquifer`.

### `servant.bible/mcp`

One address, two audiences. A person opening it in a browser sees the server
list page, the same page as `servant.bible/`. A program asking for JSON gets the
list as data. The data is also available at the explicit address
`servant.bible/mcp.json` for tools that cannot set an `Accept` header. A master
index server that speaks MCP itself stays in the task list's "Later" section.

### `servant.bible/`

Serves the one-page site generated from the list (task 4). The redirect to the
Notion BT Servant page is retired when the router takes over the apex.
`www.servant.bible` redirects to the apex.

### What the router passes through

The whole prefix `servant.bible/org/<org>/server/<server>/[<version>/]` is the
server's. `/mcp` under it is the MCP endpoint; anything else under it, such as
`/health` or a server's own documentation page, is passed to the server
unchanged. The router never rewrites what a server returns.

### Legacy addresses

`tc-helps.mcp.servant.bible` keeps working after the move so that nothing
breaks on the day the nameservers change. It is a legacy address: it is not
listed, no new subdomains are created, and it can be retired once every known
consumer has moved to the path-style address.

## Consequences

- Task 3 moves each server to its canonical path and registers that path in the
  BT Servant pool on staging first, then production.
- The list (task 4) must carry, per server: organization slug, server slug,
  shorthand, the versions it offers, which version is current, the backend
  address of each version, and the resources covered.
- Adding or renaming a server is a change to the list, reviewed in this
  repository, not a DNS change.
- Organization and server slugs are permanent once published. Renaming one means
  keeping the old path alive as an alias.
