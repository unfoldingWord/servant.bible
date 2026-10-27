# ADR 0004: Servant.Bible is a hosting-agnostic registry

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Ian Lindsley
- **Task:** Servant.Bible v0.1 task list, item 3
- **Depends on:** [ADR 0002](0002-url-naming-convention.md), [ADR 0003](0003-one-router-worker-at-the-apex.md)

## Context

The v0.1 task list frames item 3 as moving servers: "Move Aquifer off
klappy.dev", "move the remaining servers, one at a time". That framing dates
from before the router design in ADR 0003 was thought through. The router
forwards a request to any Model Context Protocol (MCP) server reachable over
HTTPS and relays the answer, whoever runs the server and wherever it lives.
Once that is true, re-hosting a server is no longer needed for it to have a
`servant.bible` address.

Aquifer forced the question. Two servers exist for the same content: a
community server built by Klappy on his own Cloudflare account, which BT
Servant uses today, and an official server run by the Aquifer team at
`api2.aquifer.bible/mcp`, announced on 2026-10-27. Neither is run by
unfoldingWord.

## Decision

### The principle

**Servant.Bible is a registry of MCP servers that unfoldingWord blesses, without
regard to where they are hosted.** A server earns a `servant.bible` address by
being on the list and meeting the quality standard, not by running on
unfoldingWord infrastructure.

### What "move to servant.bible" means

For every server, including the ones unfoldingWord runs, "moving" is two steps:
add the server to the list with its backend address, and confirm its canonical
path answers through the router. No server is re-deployed, forked, or
transferred to get an address. Service bindings (ADR 0003) remain an
optimisation available to servers on the unfoldingWord account, never a
requirement.

Re-hosting a server unfoldingWord does not run is a separate decision, taken
only if there is a concrete reason, such as the operator stepping away. It is
not part of v0.1.

### Listing a server unfoldingWord does not run

An entry for a server run by someone else carries, in addition to the fields in
ADR 0002:

- the **operator**, the organization or person who keeps it alive, named as the
  contact;
- the understanding that **outages are theirs**. The router reports them, and
  the page can show them, but Servant.Bible does not promise to fix them;
- the same **quality standard** as every other entry. Being blessed means
  meeting it, not being hosted by unfoldingWord.

### Aquifer

The `aquifer` entry fronts **Klappy's server** for now:

```
servant.bible/org/klappy/server/aquifer/mcp  ->  https://aquifer.klappy.dev/mcp
servant.bible/s/aquifer                      ->  same
```

Operator: Klappy, which is why it sits under `org/klappy` and not `org/aquifer`
(ADR 0002: the organization segment names the operator). This is the server BT
Servant already uses on staging and production, so fronting it changes nothing
about what BT Servant can answer. The `org/aquifer` path stays free for the
official server, so the two can be listed side by side.

The official server is recorded as the alternative, not chosen, for these
reasons as of 2026-10-27:

- It is a different tool set, not a second address for the same thing. It
  exposes eleven tools built around passage study, including alignment data and
  the ACAI entity registry, which Klappy's server does not have. Switching
  changes what BT Servant can answer and needs a comparison on staging first.
- Its MCP endpoint answered tool listing and tool calls with no API key on
  2026-10-27, although the REST documentation says every request needs one.
  Whether the MCP path is meant to stay keyless is an open question for the
  Aquifer team.
- Whether its rate limiting is per key or per source address is a second open
  question. Per-address limits would be shared by every Servant.Bible consumer,
  since the router's outbound addresses are Cloudflare's.

Listing the official server as well, at
`servant.bible/org/aquifer/server/aquifer/mcp`, or moving the `/s/aquifer`
shorthand from one to the other, is a list change reviewed in this repository,
not a new address.

## Consequences

- Task 3's "Move Aquifer off klappy.dev" is replaced by "Aquifer reachable
  through servant.bible". The server stays where it is.
- Task 3's per-server moves become list entries plus a verification that each
  canonical path answers. The unfoldingWord servers on `workers.dev` and Pages
  addresses keep those addresses as backends.
- The list schema (task 4) gains an operator field and whatever the quality
  standard requires an entry to declare.
- The page can show, per server, who runs it. Readers should be able to tell a
  server unfoldingWord runs from one it blesses.
