# ADR 0008: The MCP server standard is a document here, published at `/standard`

- **Status:** Accepted
- **Date:** 2026-11-02
- **Deciders:** Ian Lindsley
- **Task:** Issue #20
- **Amends:** [ADR 0006](0006-the-page-behind-a-shared-password.md), decision 1
- **Depends on:** [ADR 0004](0004-hosting-agnostic-registry.md),
  [ADR 0006](0006-the-page-behind-a-shared-password.md),
  [ADR 0007](0007-a-sign-in-page-and-a-signed-cookie.md)

## Context

ADR 0004 says a server earns a `servant.bible` address by being listed and
"meeting the quality standard", and the page at `/` tells its readers that
every server on the list meets a common quality standard. No such standard is
published. The discussion of what makes a good Model Context Protocol (MCP)
server for Bible data has been pushed back for weeks, and Johan wrote a first
pass at the criteria for the team meeting of 2026-10-27. #20 asks to publish
that first pass as version 0.1, as written, rather than wait for a refined
one, so that ADR 0004 has something to point at and the team has a text to
argue with.

The page generator (#9) left the home page's link to the standard out on
purpose: a primary action that answers 404 is worse than none. The test that
guards that is the one this change turns around.

## Decision

1. **The standard is a document in this repository**,
   [`docs/mcp-standard.md`](../mcp-standard.md), with its version in its own
   heading (`v0.1`), changed only by pull request. It is the standard ADR
   0004 refers to. Its version is the team's understanding, not the package
   version, and the two move independently.
2. **It is published at `GET /standard`**, rendered from that Markdown by
   the same build step as the page (`pnpm generate:page`) so it shares the
   stylesheet, the nav, and the colophon. The result is `public/standard.html`,
   generated on every build, gitignored, and never hand-edited. The router
   fetches it from the asset layer; a direct request for `/standard.html`
   answers 404 like the sign-in files, so the page has one address.
3. **The renderer accepts a strict subset of Markdown**: `#` and `##`
   headings, paragraphs, `-` list items, and inline `**bold**`, `` `code` ``,
   and `[text](https://...)` links. Any line it does not understand fails the
   build naming the line, the way an invalid `servers.json` does. No Markdown
   library: the subset is small, and a dependency the audit has to watch is
   not worth it for one document.
4. **The page is gated like `/`.** ADR 0006 decision 1 now reads: `GET` and
   `HEAD` of `/`, of `/standard`, and of `/mcp` when the request asks for
   HTML, require the shared credential, presented as ADR 0007 says. The
   Markdown is public on GitHub regardless; the gate covers the site while it
   is a private preview, not the text. `/standard` fails closed with the other
   page routes.
5. **Suggestions are GitHub issues.** The page ends with a note that this is
   version 0.1 of the team's understanding and a link to open an issue in
   this repository. No mailbox to watch; the suggestion lands where the team
   already works.
6. **Nothing else changes.** Nothing a program calls is gated or altered.
   `servers.json` and its schema do not record whether an entry meets the
   standard; that is a schema decision for a later record.

## Consequences

- ADR 0004 is enforceable: a pull request that lists a server can be read
  against the eleven criteria, and `docs/adding-a-server.md` points at them.
- The home page's hero links the standard, and the test that forbade the link
  now requires it.
- Changing the standard is a Markdown edit and a pull request. Bumping its
  version is editing the heading. The build refuses a construct the renderer
  does not know, so a contributor finds out at commit time, not on the page.
- The gate now covers three addresses. Removing it (ADR 0006, decision 7) is
  still one pull request.
- Whether a listed entry meets the standard, and how the page would show it,
  is a `servers.json` schema question for a follow-up issue.
