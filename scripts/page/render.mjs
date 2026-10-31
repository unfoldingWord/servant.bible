/**
 * Render the Servant.Bible page from a parsed servers.json (#9).
 *
 * Pure: the document in, one HTML string out. The generator wraps it with
 * file I/O and validation. Every string from the list passes through
 * `escape`, in text and in attributes alike. The page shows what a reader
 * needs to use a server (ADR 0002 addresses, versions, transport, resources,
 * operator per ADR 0004, status per ADR 0005) and never a backend, a binding,
 * or whether a server wants a credential.
 */

const SITE = 'https://servant.bible';
const REPO = 'https://github.com/unfoldingWord/servant.bible';
const ADD_A_SERVER = `${REPO}/blob/main/docs/adding-a-server.md`;
const UNFOLDINGWORD = 'unfoldingWord';
/** The org slug that is unfoldingWord: the canonical operator identity (ADR 0002). */
const UNFOLDINGWORD_ORG = 'uw';
const FONTS =
  'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';

const ESCAPES = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/** HTML-escape a value for text or an attribute. */
export function escape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES.get(char) ?? char);
}

/** The canonical prefix of an entry (ADR 0002), without the host. */
function prefix(entry) {
  return `/org/${escape(entry.org)}/server/${escape(entry.server)}`;
}

function isLive(entry) {
  return entry.kind === 'server' && (entry.status === 'available' || entry.status === 'degraded');
}

function link(url, text) {
  return `<a href="${escape(url)}">${escape(text)}</a>`;
}

function status(entry) {
  return `<span class="status status-${escape(entry.status)}">${escape(entry.status)}</span>`;
}

function head(entry) {
  return `<div class="card-head"><h3>${escape(entry.name)}</h3>${status(entry)}</div>`;
}

/**
 * Run by unfoldingWord, or run by someone else and blessed (ADR 0004). The
 * org slug decides, not the display name: `org` names the operator (ADR
 * 0002) and is constrained, while `operator.name` is free text.
 */
function operator(entry) {
  const { name, url } = entry.operator;
  const chip = `<span class="chip">${url ? link(url, name) : escape(name)}</span>`;
  if (entry.org === UNFOLDINGWORD_ORG) return `<p class="operator">Run by ${chip}</p>`;
  return `<p class="operator operator-blessed">Run by ${chip} blessed by ${UNFOLDINGWORD}</p>`;
}

function badges(entry) {
  const resources = entry.resources ?? [];
  if (resources.length === 0) return '';
  return `<ul class="badges">${resources.map((r) => `<li>${escape(r)}</li>`).join('')}</ul>`;
}

function links(entry) {
  const items = [];
  if (entry.repository) items.push(`<li>${link(entry.repository, 'Repository')}</li>`);
  if (entry.documentation) items.push(`<li>${link(entry.documentation, 'Documentation')}</li>`);
  const sources = entry.sources ?? [];
  if (sources.length > 0) {
    const label = sources.length === 1 ? 'Source' : 'Sources';
    const named = sources.map((s) => link(s.url, s.name)).join(', ');
    items.push(`<li><span class="label">${label}</span> ${named}</li>`);
  }
  return items.length === 0 ? '' : `<ul class="links">${items.join('')}</ul>`;
}

function address(label, url) {
  const copy = `<button class="copy" type="button" data-copy="${url}">Copy</button>`;
  return `<div class="address"><dt>${label}</dt><dd><code>${url}</code>${copy}</dd></div>`;
}

function addresses(entry) {
  const rows = [address('Endpoint', `${SITE}${prefix(entry)}/mcp`)];
  if (entry.shorthand) rows.push(address('Shorthand', `${SITE}/s/${escape(entry.shorthand)}`));
  return `<dl class="addresses">${rows.join('')}</dl>`;
}

function version(entry, key, value) {
  const current = key === entry.current ? ' version-current' : '';
  const tag = `<span class="tag">${escape(key)}</span>`;
  const pinned = `<code>${prefix(entry)}/${escape(key)}/mcp</code>`;
  const transport = `<span class="transport">${escape(value.transport)}</span>`;
  return `<li class="version${current}">${tag}${pinned}${transport}</li>`;
}

function versions(entry) {
  const rows = Object.entries(entry.versions ?? {}).map(([key, value]) =>
    version(entry, key, value)
  );
  return `<ul class="versions">${rows.join('')}</ul>`;
}

function card(entry) {
  const identity = [
    head(entry),
    operator(entry),
    `<p class="description">${escape(entry.description)}</p>`,
    `<p class="purpose">${escape(entry.purpose)}</p>`,
    badges(entry),
    links(entry),
  ].join('');
  const access = addresses(entry) + versions(entry);
  return `<li class="card" data-entry="${escape(entry.org)}/${escape(entry.server)}"><div class="card-identity">${identity}</div><div class="card-access">${access}</div></li>`;
}

/** A planned or retired entry: the reserved slug, no address claimed. */
function tile(entry) {
  const slug = `${escape(entry.kind)} · org/${escape(entry.org)}/server/${escape(entry.server)}`;
  const body = [
    head(entry),
    `<span class="slug">${slug}</span>`,
    `<p class="description">${escape(entry.description)}</p>`,
    `<p class="purpose">${escape(entry.purpose)}</p>`,
    badges(entry),
    links(entry),
    operator(entry),
  ].join('');
  return `<li class="tile" data-entry="${escape(entry.org)}/${escape(entry.server)}">${body}</li>`;
}

const SECTIONS = [
  {
    id: 'servers',
    eyebrow: 'Available now',
    title: 'Servers',
    blurb:
      'Every address below answers through the router at servant.bible. Pin a version or take the current one.',
    pick: isLive,
    list: 'cards',
    item: card,
  },
  {
    id: 'coming',
    eyebrow: 'Reserved',
    title: 'Coming',
    blurb:
      'Listed so the slugs are reserved and the team can see what is on the way. Nothing here answers yet.',
    pick: (entry) => !isLive(entry) && entry.status !== 'retired',
    list: 'grid',
    item: tile,
  },
  {
    id: 'retired',
    eyebrow: 'Gone',
    title: 'Retired',
    blurb: 'Slugs are permanent, so these stay listed. Their addresses answer 410 Gone.',
    pick: (entry) => entry.status === 'retired',
    list: 'grid',
    item: tile,
  },
];

function section(spec, entries) {
  const chosen = entries.filter(spec.pick);
  if (chosen.length === 0) return '';
  const heading = `<div><span class="eyebrow">${spec.eyebrow}</span><h2>${spec.title}</h2></div>`;
  const items = chosen.map(spec.item).join('');
  return `<section class="section" id="${spec.id}"><div class="section-head">${heading}<p>${spec.blurb}</p></div><ul class="${spec.list}">${items}</ul></section>`;
}

function nav(entries) {
  const present = SECTIONS.filter((spec) => entries.some(spec.pick));
  const items = present.map((spec) => `<li><a href="#${spec.id}">${spec.title}</a></li>`);
  items.push(`<li class="optional"><a href="${REPO}">GitHub</a></li>`);
  const brand = `<a class="brand" href="/"><span class="brand-dot"></span>Servant.Bible</a>`;
  return `<nav class="nav"><div class="nav-inner">${brand}<ul class="nav-links">${items.join('')}</ul></div></nav>`;
}

function stat(n, label) {
  return `<li><span class="n">${n}</span><span class="l">${label}</span></li>`;
}

function stats(entries) {
  const live = entries.filter(isLive).length;
  const planned = entries.filter((entry) => entry.status === 'planned').length;
  const operators = new Set(entries.map((entry) => entry.operator.name)).size;
  return `<ul class="stats">${stat(live, 'servers live')}${stat(planned, 'planned')}${stat(operators, operators === 1 ? 'operator' : 'operators')}</ul>`;
}

function hero(entries, version) {
  const lead =
    'Servant.Bible lists MCP servers that give AI agents access to <strong>trusted Bible resources</strong> — translation helps, study notes, dictionaries, and texts. Each server on this list meets a common quality standard, so a tool like <strong>BT Servant</strong> can answer a translator’s question from the actual sources, not from memory.';
  // The MCP standard (#20) gets its link here once its route exists; a
  // primary action that answers 404 is worse than none.
  const ctas = [
    `<a class="btn btn-primary" href="/mcp.json">Get the list <code>/mcp.json</code></a>`,
    `<a class="btn" href="${ADD_A_SERVER}">Add a server</a>`,
  ].join('');
  return `<header class="hero"><span class="eyebrow">MCP registry · v${escape(version)}</span><h1>Bible resources <span class="glow">any agent</span> can trust.</h1><p class="lead">${lead}</p><div class="cta-row">${ctas}</div>${stats(entries)}</header>`;
}

function colophon(version) {
  return `<footer class="colophon"><span>Servant.Bible ${escape(version)} · generated from servers.json</span>${link(REPO, 'github.com/unfoldingWord/servant.bible')}</footer>`;
}

/**
 * The whole page. `doc` is a parsed servers.json that already passed the
 * schema; `options` carries the stylesheet and script to inline and the
 * package version for the colophon.
 */
export function renderPage(doc, options) {
  const { entries } = doc;
  const { css, script, version } = options;
  const sections = SECTIONS.map((spec) => section(spec, entries)).join('');
  const main = `<main class="scroll"><div class="page">${hero(entries, version)}${sections}${colophon(version)}</div></main>`;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    '<title>Servant.Bible</title>',
    '<meta name="description" content="Servant.Bible: the Bible resource layer any AI agent can call. The list of MCP servers unfoldingWord runs or blesses." />',
    `<link rel="stylesheet" href="${FONTS}" />`,
    `<style>\n${css}\n</style>`,
    '</head>',
    '<body>',
    nav(entries),
    main,
    `<script>\n${script}\n</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
