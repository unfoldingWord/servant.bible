# Servant.Bible

Servant.Bible is a Bible resource layer that any AI agent or application can call.
It brings together resource servers that speak the Model Context Protocol (MCP),
such as translation helps, Bible texts, study notes, and dictionaries, so that a
tool like [BT Servant](https://github.com/unfoldingWord/bt-servant-worker) can
answer a translator's question from trusted sources rather than from memory.

The servers are built and run by unfoldingWord and by partners. Servant.Bible is
the shared front door: one domain, one list of what is available, and one
quality standard that every server on the list meets.

## Status

Servant.Bible is at version 0.1 and under active construction. Decisions about
how it is shaped are recorded as they are made in the
[decision records](docs/README.md); read those for the current state rather
than this page.

## What is in this repository

| Path                                         | Contents                                                                                                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`servers.json`](servers.json)               | The registry: every server and dataset, with its backends, operator, and status ([ADR 0005](docs/adr/0005-the-list-carries-datasets-and-a-status.md)). To add one, see [`docs/adding-a-server.md`](docs/adding-a-server.md). |
| [`servers.schema.json`](servers.schema.json) | The JSON Schema that `pnpm validate:servers` checks the registry against, in the pre-commit hook and in CI.                                                                                                                  |
| [`docs/`](docs/)                             | Documentation, starting with the [decision records](docs/README.md).                                                                                                                                                         |
| [`src/`](src/)                               | The router Worker that owns the apex ([ADR 0003](docs/adr/0003-one-router-worker-at-the-apex.md)).                                                                                                                           |
| [`public/`](public/)                         | Static assets the Worker serves; the generated page will land here.                                                                                                                                                          |
| [`tests/`](tests/)                           | Vitest tests: `unit/` runs inside the Workers runtime, `node/` covers the dev-time scripts.                                                                                                                                  |
| [`.github/`](.github/)                       | CI on every pull request, deployments from CI, Dependabot.                                                                                                                                                                   |
| Issues                                       | Proposed datasets and servers, such as a Bible passages dataset and a strategic languages list.                                                                                                                              |

The page built from the registry will live in this repository as well.

## Addresses

The router answers every address in
[ADR 0002](docs/adr/0002-url-naming-convention.md) on `https://servant.bible`
(production) and `https://staging.servant.bible` (staging), with
`www.servant.bible` redirecting to the apex. Forwarding is a proxy,
never a redirect: method, body, and headers pass through, the response streams
back, and the router holds no credentials
([ADR 0003](docs/adr/0003-one-router-worker-at-the-apex.md)).

| Path                                           | Behaviour                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/org/<org>/server/<server>/mcp`               | Forwarded to the backend of the version marked `current`.                                                                                                           |
| `/org/<org>/server/<server>/<version>/mcp`     | Forwarded to that version's backend.                                                                                                                                |
| `/org/<org>/server/<server>/[<version>/]<any>` | Forwarded too. The prefix stands for the directory that holds the backend's `/mcp`, so a backend at `https://h/api/mcp` serves `/health` as `https://h/api/health`. |
| `/s/<shorthand>[/<any>]`                       | Alias of the canonical prefix; `/s/<shorthand>` alone is the endpoint.                                                                                              |
| `/mcp`                                         | A browser (`Accept: text/html`) gets the page; anything else gets the list as JSON.                                                                                 |
| `/mcp.json`                                    | Always the list as JSON, with `$schema` pointing at `/servers.schema.json`.                                                                                         |
| `/servers.schema.json`                         | The schema the list is checked against.                                                                                                                             |
| `/`                                            | The page.                                                                                                                                                           |
| `/health`                                      | The router's version, environment, and the number of servers it routes.                                                                                             |
| `www.` host                                    | `308` to the same path on the apex.                                                                                                                                 |

Which entries are routed follows the `status` field
([ADR 0005](docs/adr/0005-the-list-carries-datasets-and-a-status.md)):
`available` and `degraded` servers are forwarded, a `planned` server or a
dataset answers `404` with a short JSON body saying why, a `retired` entry
answers `410`, and an unknown org, server, version, or shorthand answers `404`.
Nothing is ever forwarded on a guess.

The router logs one structured line per forwarded request (`org`, `server`,
`version`, method, upstream status, and milliseconds to the upstream headers)
and never a request or response body.

One `servers.json` serves both deployments. A merge to `main` deploys staging,
so staging always runs the newest list; production follows when the Deploy
workflow is dispatched. That is how a new server or version is proven on
staging first (ADR 0003, decision 3).

## Development

Requires Node 22 (`.nvmrc`) and pnpm.

```sh
pnpm install
pnpm dev            # wrangler dev on localhost:8787
pnpm test           # Vitest: tests/unit in the Workers runtime, tests/node under Node
pnpm validate:servers  # servers.json against servers.schema.json
pnpm lint           # ESLint on src/, tests/, scripts/
pnpm format:check   # Prettier
pnpm check          # tsc
pnpm build          # wrangler build
pnpm audit:prod     # production tree, any severity fails
pnpm audit:all      # full tree, high or critical fails
```

The pre-commit hook runs the same gates. CI runs them on every pull request.

Deployments run from CI only. A merge to `main` deploys staging to
`staging.servant.bible`; production deploys to `servant.bible` by manual
dispatch of the Deploy workflow. Both are Workers Custom Domains declared in
`wrangler.toml`, and `tests/node/wrangler-config.test.ts` pins which names each
deployment owns. The `workers.dev` names of both deployments stay on as
fallbacks for now. Each deployment reports its version at `/health`. See
[`CLAUDE.md`](CLAUDE.md) for the rules every contributor and agent follows
here.

## Related repositories

- [translation-helps-mcp](https://github.com/unfoldingWord/translation-helps-mcp),
  served at `servant.bible/org/uw/server/tc-helps/mcp` (`/s/tc-helps`)
- [fia-mcp](https://github.com/unfoldingWord/fia-mcp), served at
  `servant.bible/org/uw/server/fia/mcp` (`/s/fia`)
- [obs-5m-mcp](https://github.com/unfoldingWord/obs-5m-mcp), served at
  `servant.bible/org/uw/server/obs-5m/mcp` (`/s/obs-5m`)
- [bt-servant-worker](https://github.com/unfoldingWord/bt-servant-worker), the
  main consumer of these servers today
