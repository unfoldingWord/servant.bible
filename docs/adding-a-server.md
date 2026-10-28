# Adding a server or a dataset

Servant.Bible has one registry: [`servers.json`](../servers.json) at the root
of this repository. The page, the router, and `/mcp.json` are all built from
it ([ADR 0003](adr/0003-one-router-worker-at-the-apex.md), decision 5). To add
a server or a dataset, add one entry to that file in a pull request. There is
no second place to register it.

## Steps

1. Branch from `main`.
2. Copy the closest existing entry in `servers.json` and change every field.
3. Run `pnpm validate:servers`. It checks the entry against
   [`servers.schema.json`](../servers.schema.json) and the three rules the
   schema cannot express (unique `org` + `server`, unique `shorthand`,
   `current` names a version). The same check runs in the pre-commit hook and
   in CI, so an invalid entry cannot be merged.
4. Open a pull request. Say who operates the server and link the proof that
   its backend answers an MCP `initialize` and `tools/list`.
5. After the merge, the staging router serves the entry first
   ([ADR 0003](adr/0003-one-router-worker-at-the-apex.md), decision 3). Production
   follows by manual deploy.

## Fields

Every entry has these:

| field         | meaning                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`        | `server` (an MCP server with a backend) or `dataset` (data that may not have a server yet). [ADR 0005](adr/0005-the-list-carries-datasets-and-a-status.md). |
| `status`      | `available`, `planned`, `degraded`, or `retired`. Only available and degraded servers are routed. Retired entries keep their slugs and answer `410`.        |
| `org`         | The operator's slug: `uw`, `klappy`, `aquifer`. Lowercase letters, digits, and single hyphens. **Permanent once merged.**                                   |
| `server`      | The entry's slug, unique within its `org`. Same rules, also permanent. Datasets reserve theirs now so no rename is needed when a server appears.            |
| `shorthand`   | Optional. The name after `/s/`, unique across every organization. Not every entry needs one. Assigning or moving one is a reviewed list change.             |
| `name`        | Display name.                                                                                                                                               |
| `description` | What the entry contains.                                                                                                                                    |
| `purpose`     | Who it is for and why it exists. One sentence.                                                                                                              |
| `operator`    | `{ "name", "url"?, "contact"? }`. Who keeps it alive ([ADR 0004](adr/0004-hosting-agnostic-registry.md)). Required for every entry, and the page shows it.  |
| `sources`     | Optional. `[{ "name", "url" }]` naming the upstream data. The only place a relationship between entries is defined; the map draws from it.                  |
| `repository`  | Optional. The code, if public.                                                                                                                              |
| `resources`   | Optional. What it covers, from the fixed vocabulary in the schema (`bible`, `translation-notes`, `study-notes`, and so on). The same slugs BT Servant uses. |

A `server` that is `available` or `degraded` also has:

| field      | meaning                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `versions` | An object keyed `v1`, `v2`, and so on. Each value is `{ "backend", "transport", "binding"?, "auth"? }`. `backend` is the full `https://` URL of the MCP endpoint the router forwards to. `transport` is `json-rpc` or `streamable-http`. |
| `current`  | Which version the unversioned path serves ([ADR 0002](adr/0002-url-naming-convention.md)). Must be a key of `versions`.                                                                                                                  |

`binding` names a Cloudflare service binding for a backend on the
unfoldingWord account ([ADR 0003](adr/0003-one-router-worker-at-the-apex.md),
decision 8); the router uses it when present. `auth: "bearer"` says consumers
must send a bearer token; the router passes it through and never holds one
(decision 7).

A `planned` or `retired` server may omit `versions` and `current`. A `dataset`
never has them.

## Slug rules

- Lowercase letters, digits, and single hyphens: `^[a-z0-9]+(-[a-z0-9]+)*$`.
- `org` names the operator, not the content. Two organizations may each have a
  `server` called `aquifer`; only one may hold the `/s/aquifer` shorthand.
- Slugs are permanent once merged. Renaming means keeping the old path alive as
  an alias, which is a new entry, not an edit.

## An operator outside unfoldingWord

A server unfoldingWord does not run is listed the same way, with its
`operator` naming who does. The entry is a promise that the address answers,
so the pull request names the contact and the backend is verified before
merge. Re-hosting is never a condition of listing
([ADR 0004](adr/0004-hosting-agnostic-registry.md)).
