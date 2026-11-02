# The MCP server standard, v0.1

Servant.Bible lists Model Context Protocol (MCP) servers that unfoldingWord runs or blesses. Every server on the list is expected to meet this standard, whoever runs it and wherever it is hosted. This is version 0.1: the team's first written understanding, published as it was drafted so that it can be used and argued with.

## What a good MCP server for Bible data does

A good MCP server for Bible data is a server which:

- **Has clearly defined tools:** each tool has one clear purpose, a precise name, well-defined parameters and a consistent response format, so the assistant knows which tool to choose and what it will receive back.
- **Is self-describing:** its tools and instructions explain clearly how to use them (for example, which version codes and book names are valid), so an AI assistant can use the server correctly without guessing.
- **Is transparent about versions:** it presents the available data/translations together with their licensing and attribution information.
- **Uses standard identifiers:** it uses common standards for books and references (for example, USFM or OSIS book codes), so the data can be combined with other resources and compared across versions.
- **Is flexible with references:** it accepts references in the common formats and also in the language of the user.
- **Is faithful to the text:** it returns the text in exactly the version which was requested, while preserving the versification, book names and, if needed, any formatting.
- **Has high uptime:** it is dependable, with a high uptime and fast, consistent response times.
- **Is transparent about its status:** it has a public status page, documented rate limits and clear communication about maintenance or downtime.
- **Handles errors properly:** when an error occurs, it gives a clear message, instead of failing silently or returning a wrong passage.
- **Delivers content reliably:** the same query will always give the same faithful text, so that the assistants and their users can be confident that what they are quoting corresponds exactly to what the translation says.
- **Is economical with context:** it returns compact and structured output, with limits on the size of a response and pagination, so that a long passage or search does not fill the context window of the assistant.

## Suggestions

This is version 0.1 of our understanding of what a good MCP server for Bible data is. If a criterion is unclear, missing, or wrong, [open an issue](https://github.com/unfoldingWord/servant.bible/issues/new) in the Servant.Bible repository. Changes to this document are made by pull request, and its version number moves when the criteria do.
