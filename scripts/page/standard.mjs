/**
 * Render the MCP server standard (ADR 0008) from docs/mcp-standard.md into a
 * page in the site's design. Pure, like render.mjs: the Markdown in, one HTML
 * string out; the generator wraps it with file I/O.
 *
 * The renderer knows a strict subset of Markdown: `#` and `##` headings,
 * paragraphs, `-` list items, and inline `**bold**`, `` `code` ``, and
 * `[text](https://...)` links. Anything else throws, naming the line, so a
 * construct that would print wrongly fails the build instead of reaching the
 * page (ADR 0008, decision 3). Everything is escaped on the way out.
 */

import { REPO, colophon, documentHead, escape, navBar, signOut } from './render.mjs';

const TITLE = 'MCP server standard · Servant.Bible';
/** What the colophon says this page is generated from. */
const SOURCE = 'docs/mcp-standard.md';
const DESCRIPTION =
  'What makes a good MCP server for Bible data: the standard every server listed on Servant.Bible is expected to meet.';

const HEADINGS = [
  [/^# (.+)$/, 1],
  [/^## (.+)$/, 2],
];
const ITEM = /^- (.+)$/;
/** Block-level Markdown this renderer does not know and would otherwise print as text. */
const UNSUPPORTED = /^(#|>|\*|\+|[0-9]+\.|!\[|\||`|-|\s)/;
/** One inline construct: a code span, a bold run, or an https link. */
const INLINE = /`([^`]+)`|\*\*([^*`[\]]+)\*\*|\[([^\]`*[]+)\]\((https:\/\/[^)\s"]+)\)/g;
/** Left over in plain text, these mean a construct the regex above did not take. */
const LEFTOVER = /[`*[\]<>]/;

function plain(text, line) {
  if (LEFTOVER.test(text)) {
    throw new Error(`line ${line}: unsupported inline Markdown or HTML: ${text}`);
  }
  return escape(text);
}

/** Render one line of text: bold, code, and links; everything else escaped. */
function inline(text, line) {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    html += plain(text.slice(last, match.index), line);
    const [whole, code, bold, label, url] = match;
    if (code !== undefined) html += `<code>${escape(code)}</code>`;
    else if (bold !== undefined) html += `<strong>${escape(bold)}</strong>`;
    else html += `<a href="${escape(url)}">${escape(label)}</a>`;
    last = match.index + whole.length;
  }
  return html + plain(text.slice(last), line);
}

/** What one line is: blank, a heading, a list item, or text. Throws on anything else. */
function kindOf(text, line) {
  if (text.trim() === '') return { kind: 'blank' };
  for (const [pattern, level] of HEADINGS) {
    const match = pattern.exec(text);
    if (match) return { kind: 'heading', level, text: match[1] };
  }
  const item = ITEM.exec(text);
  if (item) return { kind: 'item', text: item[1] };
  if (UNSUPPORTED.test(text)) throw new Error(`line ${line}: unsupported Markdown: ${text}`);
  return { kind: 'text', text };
}

/** `kindOf`, with the line's inline constructs checked so an error names this line. */
function classify(text, line) {
  const seen = kindOf(text, line);
  if (seen.kind !== 'blank') inline(seen.text, line);
  return seen;
}

/**
 * The document as blocks: `heading` (with `level`), `paragraph` (lines
 * joined with a space), and `list` (its items). Each block carries the line
 * it starts on. Inline constructs are checked here, line by line, so an
 * error names the line the construct is on even inside a joined paragraph;
 * rendering a parsed block cannot fail. A text line straight after a list
 * item is refused: Markdown would make it part of the item, and this
 * renderer would not.
 */
export function parseStandard(markdown) {
  const blocks = [];
  let open;
  markdown.split('\n').forEach((raw, index) => {
    const line = index + 1;
    const seen = classify(raw, line);
    if (seen.kind === 'blank') {
      open = undefined;
    } else if (seen.kind === 'heading') {
      blocks.push({ type: 'heading', level: seen.level, text: seen.text, line });
      open = undefined;
    } else if (seen.kind === 'item') {
      if (open?.type !== 'list') blocks.push((open = { type: 'list', items: [], line }));
      open.items.push(seen.text);
    } else if (open?.type === 'list') {
      throw new Error(`line ${line}: a list must be followed by a blank line`);
    } else if (open?.type === 'paragraph') {
      open.text += ` ${seen.text}`;
    } else {
      blocks.push((open = { type: 'paragraph', text: seen.text, line }));
    }
  });
  return blocks;
}

function block(b) {
  switch (b.type) {
    case 'heading':
      return `<h${b.level}>${inline(b.text, b.line)}</h${b.level}>`;
    case 'list':
      return `<ul>${b.items.map((item, i) => `<li>${inline(item, b.line + i)}</li>`).join('')}</ul>`;
    default:
      return `<p>${inline(b.text, b.line)}</p>`;
  }
}

/**
 * The standard's page. `options` carries the Markdown of docs/mcp-standard.md,
 * the stylesheet to inline, and the package version for the colophon.
 */
export function renderStandard(options) {
  const { markdown, css, version } = options;
  const article = parseStandard(markdown).map(block).join('');
  const items = [
    '<li><a href="/">Servers</a></li>',
    `<li class="optional"><a href="${REPO}">GitHub</a></li>`,
    `<li>${signOut()}</li>`,
  ];
  const doc = `<article class="standard-doc"><span class="eyebrow">Quality standard</span>${article}</article>`;
  const main = `<main class="scroll"><div class="page standard">${doc}${colophon(version, SOURCE)}</div></main>`;
  return [
    ...documentHead({ title: TITLE, description: DESCRIPTION, css }),
    '<body>',
    navBar(items),
    main,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
