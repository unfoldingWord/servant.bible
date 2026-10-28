# ADR 0005: The list carries datasets and a status

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** Ian Lindsley
- **Task:** Servant.Bible v0.1 task list, item 4
- **Depends on:** [ADR 0002](0002-url-naming-convention.md), [ADR 0003](0003-one-router-worker-at-the-apex.md), [ADR 0004](0004-hosting-agnostic-registry.md)

## Context

Task 4 adds "a JSON file listing the MCP servers", the file that ADR 0003
makes the router's configuration and ADR 0002 serves at `/mcp.json`. Issue #7
settled its shape. Five questions came up that the earlier records do not
answer, raised by the vision owner's whiteboard of the site and by issue #21:

1. Whether the file is edited as JSON or as YAML with JSON generated.
2. Whether the datasets in issues #1 to #5, most of which have no MCP server
   yet, appear on the list before their servers exist. The whiteboard's index
   shows Strategic Languages, language data, Bible data, and a Bibles group
   next to the servers.
3. Whether each entry says what it is for and where its data comes from. The
   whiteboard lists description, purpose, link, and sources per entry; the
   interactive map in #21 needs the sources to draw its edges.
4. Whether DCS (Door43 Content Service) is an entry or the source behind others.
5. Whether an entry can be routed but hidden from the page, or switched off.

ADR 0004 defines Servant.Bible as a registry of MCP servers and ADR 0002 calls
`/mcp` the list of all servers. Listing datasets changes what the published
file means to a program that reads it, so the answer is recorded here and not
in the schema.

## Decision

1. **The file is a list of entries, and an entry is a server or a dataset.**
   Every entry carries `kind`, either `server` or `dataset`. A dataset may be
   listed before any server exists for it, so the page can show what is
   coming and the slugs are reserved. The root key is `entries`, not
   `servers`, so that the name does not lie.

2. **Every entry carries a `status`**, one of `available`, `planned`,
   `degraded`, or `retired`, and the router (ADR 0003) acts on it:

   | status      | on the page          | routed                          |
   | ----------- | -------------------- | ------------------------------- |
   | `available` | shown                | yes, when `kind` is `server`    |
   | `degraded`  | shown with a warning | yes, when `kind` is `server`    |
   | `planned`   | shown as coming      | no                              |
   | `retired`   | shown as retired     | no; its paths answer `410 Gone` |

   A retired entry keeps its `org`, `server`, and `shorthand`: slugs are
   permanent (ADR 0002), and a client that asks for a retired path learns that
   it is gone rather than seeing a `404`. A server that is `available` or
   `degraded` must declare its `versions` and which one is `current`; a
   `planned` or `retired` server may omit them; a dataset never has them.
   `status` is also the v0.1 answer to "status and uptime" on the page (#29):
   a field set by hand in a reviewed pull request, until live metrics exist.

3. **Every entry states its `purpose`, and may list its `sources`.**
   `description` says what an entry contains; `purpose` says who it is for and
   why it exists. `sources` is an optional array of `{ name, url }` naming the
   upstream data, and it is the only place a relationship between entries is
   defined. The map in #21 draws its edges from `sources`; there is no second
   list of relationships.

4. **Nothing on the list is hidden.** There is no `listed: false`. Everything
   in the file appears on the page, because a server earns its address by
   being listed (ADR 0004). `status` is the one switch. A server is tried
   before it is announced on the staging router, which has its own copy of
   the list (ADR 0003, decision 3), not by a hidden entry in production.

5. **The file is JSON, and a schema guards it.** `servers.json` at the
   repository root is edited directly; there is no YAML source and no
   generated copy. `servers.schema.json` (JSON Schema 2020-12) carries every
   per-entry rule, and `scripts/validate-servers.mjs` adds the three rules
   JSON Schema cannot express: `org` + `server` unique, `shorthand` unique
   across organizations, `current` names a version. The check runs in the
   pre-commit hook and in CI on every pull request. The schema is a dev-time
   gate, not something the router loads.

6. **DCS is a source until decided otherwise.** No DCS MCP server exists
   (ADR 0001). DCS appears under `sources` on the entries built from it. If
   the vision owner wants a DCS server, it becomes one more entry, marked
   `planned`. That is a list change, not a new decision.

## Consequences

- A program reading `/mcp.json` filters by `kind` and `status` before using an
  entry as a server. The router (#8) routes only `kind: server` with `status`
  `available` or `degraded`, and answers `410` for `retired`. BT Servant's
  pool (#12) registers only entries it can call.
- The page (#9) shows every entry with its status, and #29's first version is
  the `status` field, not a probe.
- The schema is conditional on `kind` and `status`. Adding a field is a schema
  change plus a note in [`adding-a-server.md`](../adding-a-server.md); adding
  a `kind` or a `status` value is a new ADR, because the router and the page
  have to agree on what it means.
- The five datasets in issues #1 to #5 are listed now as `planned`, which
  reserves their slugs. Each owner confirms the slug on their issue; a slug is
  permanent once the entry is merged.
- The resource vocabulary is BT Servant's canonical subject slugs, so the two
  do not drift. A new resource kind is added on both sides.
