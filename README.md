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

Deployments run from CI only. A merge to `main` deploys staging; production
deploys by manual dispatch of the Deploy workflow. Each deployment reports its
version at `/health`. See [`CLAUDE.md`](CLAUDE.md) for the rules every
contributor and agent follows here.

## Related repositories

- [translation-helps-mcp](https://github.com/unfoldingWord/translation-helps-mcp)
- [fia-mcp](https://github.com/unfoldingWord/fia-mcp)
- [obs-5m-mcp](https://github.com/unfoldingWord/obs-5m-mcp)
- [bt-servant-worker](https://github.com/unfoldingWord/bt-servant-worker), the
  main consumer of these servers today
