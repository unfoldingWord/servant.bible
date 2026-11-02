# Servant.Bible docs

Decisions the team has made about Servant.Bible live under [`adr/`](adr/) as
architecture decision records, one numbered file per decision. Read them in order.

| ADR                                                                  | Decision                                                                                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](adr/0001-separate-bt-servant-from-servant-bible.md)           | Separate BT Servant from Servant.Bible: what stays, what moves, and why no BT Servant code changes                                                                           |
| [0002](adr/0002-url-naming-convention.md)                            | URL naming convention: path style under `servant.bible`, the grammar, entities, shorthand, `/mcp`, and legacy addresses                                                      |
| [0003](adr/0003-one-router-worker-at-the-apex.md)                    | One router Worker at the apex: move the nameservers to Cloudflare, proxy not redirect, the server list as router config, staging                                             |
| [0004](adr/0004-hosting-agnostic-registry.md)                        | Servant.Bible is a hosting-agnostic registry: "moving" a server means listing and fronting it, not re-hosting; Aquifer fronts Klappy's server for now                        |
| [0005](adr/0005-the-list-carries-datasets-and-a-status.md)           | The list carries datasets and a status: `kind` and `status` per entry, `purpose` and `sources`, nothing hidden, JSON validated in CI                                         |
| [0006](adr/0006-the-page-behind-a-shared-password.md)                | The page is behind a shared password, nothing else is: Basic auth on `/` and the HTML view of `/mcp`, one secret pair per environment, fails closed                          |
| [0007](adr/0007-a-sign-in-page-and-a-signed-cookie.md)               | A sign-in page and a signed cookie in front of the page: `401` with the form instead of the browser dialog, a third secret signs a 30-day cookie, fails closed               |
| [0008](adr/0008-the-mcp-server-standard-is-published-at-standard.md) | The MCP server standard is a document here, published at `/standard`: `docs/mcp-standard.md` v0.1, rendered by the page build, behind the same sign-in, suggestions by issue |

To add a server or dataset to the registry, follow
[`adding-a-server.md`](adding-a-server.md). The quality standard every listed
server is expected to meet is [`mcp-standard.md`](mcp-standard.md).

To add a decision, copy the structure of the latest ADR (Status, Date, Deciders,
Context, Decision, Consequences), take the next number, and add a row here.
