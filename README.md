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

| Path | Contents |
| --- | --- |
| [`docs/`](docs/) | Documentation, starting with the [decision records](docs/README.md). |
| Issues | Proposed datasets and servers, such as a Bible passages dataset and a strategic languages list. |

The list of servers, and the page and router built from it, will live in this
repository as well.

## Related repositories

- [translation-helps-mcp](https://github.com/unfoldingWord/translation-helps-mcp)
- [fia-mcp](https://github.com/unfoldingWord/fia-mcp)
- [obs-5m-mcp](https://github.com/unfoldingWord/obs-5m-mcp)
- [bt-servant-worker](https://github.com/unfoldingWord/bt-servant-worker), the
  main consumer of these servers today
