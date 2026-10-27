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

Version 0.1 is in progress. The work is organised as a short task list:

1. Separate BT Servant from Servant.Bible. **Done:** see
   [ADR 0001](docs/adr/0001-separate-bt-servant-from-servant-bible.md).
2. Agree a naming convention for the servers under `servant.bible`.
3. Move the unfoldingWord MCP servers to `servant.bible` hostnames.
4. Publish the list of servers from this repository as a simple page.
5. Point the BT Servant admin portal at the new addresses.

Alongside the task list, a quality standard for MCP servers is being written and
will be published here once it is ready.

## What is in this repository

| Path | Contents |
| --- | --- |
| [`docs/`](docs/) | Documentation, starting with the [decision records](docs/README.md). |
| Issues | Proposed datasets and servers, such as a Bible passages dataset and a strategic languages list. |

The list of servers and the page generated from it will be added under task 4.

## Related repositories

- [translation-helps-mcp](https://github.com/unfoldingWord/translation-helps-mcp)
- [fia-mcp](https://github.com/unfoldingWord/fia-mcp)
- [obs-5m-mcp](https://github.com/unfoldingWord/obs-5m-mcp)
- [bt-servant-worker](https://github.com/unfoldingWord/bt-servant-worker), the
  main consumer of these servers today
