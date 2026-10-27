# ADR 0001: Separate BT Servant from Servant.Bible

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Ian Lindsley
- **Task:** Servant.Bible v0.1 task list, item 1

## Context

BT Servant V2 answers Bible translation questions by calling resource servers over
the Model Context Protocol (MCP). Those servers were built alongside BT Servant and
are documented as parts of it, but nothing about them is specific to a chat
product. Servant.Bible v0.1 stands them up as a resource layer in their own right,
under the `servant.bible` domain, so that any agent or application can use them.

Before anything moves, the team needs one written answer to two questions: which
components belong on which side, and whether BT Servant has to change to call
Servant.Bible instead of what it calls today.

## Decision

### The dividing line

**BT Servant is the conversation product. Servant.Bible is the Bible resource layer
any agent can call.**

A component stays in BT Servant if it only makes sense with a chat on the other
end. A component moves to Servant.Bible if it would still be useful to another
consumer (a desktop AI client, a partner's bot, a translation editor) with BT
Servant switched off.

### Stays in BT Servant

| Component                                                                                                                   | Why it stays                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bt-servant-worker`                                                                                                         | The orchestrator. Its MCP client, the server pool in KV, the resource listing and priority endpoints, and the admin API all exist to serve a conversation. The worker consumes the resource layer; it is not part of it. |
| `bt-servant-whatsapp-gateway`, `bt-servant-telegram-gateway`, `bt-servant-signal-gateway`                                   | Channel relays into the worker.                                                                                                                                                                                          |
| `bt-servant-web-client`                                                                                                     | Chat UI.                                                                                                                                                                                                                 |
| `bt-servant-admin-portal`, `baruch`                                                                                         | Administration of the chat product, including which resource servers it uses.                                                                                                                                            |
| `bt-servant-telemetry`, `bt-servant-message-broker`, `bt-servant-log-viewer`, `bt-servant-report-sender`, `bt-servant-site` | Operations and presence of the chat product.                                                                                                                                                                             |
| `bt-servant-engine`, `bt-servant-engine-data-loaders`                                                                       | The V1 engine. Retired rather than movable.                                                                                                                                                                              |

### Moves to Servant.Bible

| Component               | Notes                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translation-helps-mcp` | unfoldingWord-owned. Door43 translation helps.                                                                                                                                                          |
| `fia-mcp`               | unfoldingWord-owned. FIA internalization.                                                                                                                                                               |
| `obs-5m-mcp`            | unfoldingWord-owned. Open Bible Stories and Five Movements.                                                                                                                                             |
| Aquifer                 | Which Aquifer server BT Servant points at (the community server on `klappy.dev` or the official `api2.aquifer.bible/mcp`) is decided under task 3, not here. Either way it is a Servant.Bible resource. |
| New datasets            | Issues #1 to #5 in this repo. Nothing to move; they start here.                                                                                                                                         |

### Out of scope, deliberately

| Component                                              | Why                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ptxprint-mcp` and the `bt-servant-ptxprint` R2 bucket | A hackathon experiment. Disabled on staging, absent from production. Not a Servant.Bible resource and not part of this split. The worker still serves that bucket on a public route; removing that route is a later cleanup, not a v0.1 item. |
| `bt-servant-kb-worker`                                 | A proof of concept that never took flight. Ignored.                                                                                                                                                                                           |

## Is BT Servant entangled with Servant.Bible?

No code is. Verified on 2026-10-27:

- No source file in `bt-servant-worker` references a resource server hostname. The
  only mentions are a comment in `wrangler.toml` about the ptxprint bucket and a
  placeholder URL in the admin portal's server dialog. Both are text, not
  behaviour.
- The worker reaches every resource server through the server pool stored in KV
  and edited through the admin API or the admin portal. A server moving to a new
  hostname is an edit to the `url` field of its pool entry. A stored auth token
  survives that edit because the write path preserves a token the request body
  omits.

So the "minor V2 update" anticipated by the task list is **configuration, not
code**: one pool edit per server, on staging first and then production, once the
servers exist under their Servant.Bible hostnames (task 3).

### The server pool as of 2026-10-27

Read from the worker's admin API. This is the input to task 3's "list every
uW-owned MCP server".

| Pool id             | Production                                           | Staging                                                          | Owner              |
| ------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| `translation-helps` | `tc-helps.mcp.servant.bible/api/mcp` (v1, Pages)     | `tc-helps.mcp.servant.bible/v2/mcp` (v2 Worker, streamable HTTP) | unfoldingWord      |
| `fia`               | `fia-mcp.unfoldingword.workers.dev/mcp` (auth token) | same                                                             | unfoldingWord      |
| `aquifer`           | `aquifer.klappy.dev/mcp`                             | same                                                             | community (Klappy) |
| `obs-5m`            | not registered                                       | `obs-5m-mcp.unfoldingword.workers.dev/mcp`                       | unfoldingWord      |
| `yaapi-bible`       | not registered                                       | `yaapi.bible/mcp`                                                | third party        |
| `ptxprint-mcp`      | not registered                                       | `ptxprint-mcp.klappy.workers.dev/mcp`, disabled                  | out of scope       |

## Consequences

- **Documentation to update** when the servers move: the component table and the
  "worker to downstream" flow in `bt-servant-worker/docs/architecture/README.md`
  list `fia-mcp` and `translation-helps-mcp` as BT Servant components, and the
  admin portal's server dialog placeholder names one specific server. Both should
  say "Servant.Bible server".
- **No worker release is needed** for the split itself. Pool edits take effect on
  the next chat turn.
- **The admin portal keeps owning the pool** for v0.1. Whether it should one day
  add servers from the Servant.Bible list with one click, or refuse servers that
  are not on the list, is in the task list's "Later" section and is not decided
  here.
- **Dead weight remains** in the worker for ptxprint (a public R2 route and bucket
  binding). It is harmless and is noted so the architecture doc stops describing a
  dependency that no longer matters.
