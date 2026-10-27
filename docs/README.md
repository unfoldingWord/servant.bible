# Servant.Bible docs

Decisions the team has made about Servant.Bible live under [`adr/`](adr/) as
architecture decision records, one numbered file per decision. Read them in order.

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-separate-bt-servant-from-servant-bible.md) | Separate BT Servant from Servant.Bible: what stays, what moves, and why no BT Servant code changes |
| [0002](adr/0002-url-naming-convention.md) | URL naming convention: path style under `servant.bible`, the grammar, entities, shorthand, `/mcp`, and legacy addresses |
| [0003](adr/0003-one-router-worker-at-the-apex.md) | One router Worker at the apex: move the nameservers to Cloudflare, proxy not redirect, the server list as router config, staging |

To add a decision, copy the structure of the latest ADR (Status, Date, Deciders,
Context, Decision, Consequences), take the next number, and add a row here.
