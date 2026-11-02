import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseStandard, renderStandard } from '../../scripts/page/standard.mjs';
import { parseRoute } from '../../src/routes.js';

/**
 * The MCP server standard (ADR 0008): docs/mcp-standard.md rendered into a
 * page by the same generator as the home page. The renderer takes a strict
 * subset of Markdown and refuses anything else, so a construct it would
 * render wrongly fails the build instead of reaching the page.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const STANDARD = readFileSync(path.join(ROOT, 'docs', 'mcp-standard.md'), 'utf8');
const OPTIONS = { css: '.fixture-css{}', version: '9.9.9' };

const FIXTURE = [
  '# Title, v0.1',
  '',
  'A paragraph',
  'over two lines.',
  '',
  '## Second',
  '',
  '- **One:** first item',
  '- Two with `code` and a [link](https://example.org/a?b=c).',
  '',
  'Trailing & "quotes" and \'apostrophes\'.',
].join('\n');

describe('parseStandard', () => {
  it('turns the subset into heading, paragraph, and list blocks', () => {
    expect(parseStandard(FIXTURE)).toEqual([
      { type: 'heading', level: 1, text: 'Title, v0.1', line: 1 },
      { type: 'paragraph', text: 'A paragraph over two lines.', line: 3 },
      { type: 'heading', level: 2, text: 'Second', line: 6 },
      {
        type: 'list',
        items: ['**One:** first item', 'Two with `code` and a [link](https://example.org/a?b=c).'],
        line: 8,
      },
      { type: 'paragraph', text: 'Trailing & "quotes" and \'apostrophes\'.', line: 11 },
    ]);
  });
});

describe('parseStandard refusals', () => {
  it.each([
    ['### Three', 'a deeper heading'],
    ['> quoted', 'a block quote'],
    ['* starred', 'a starred item'],
    ['1. numbered', 'a numbered item'],
    ['![alt](https://example.org/i.png)', 'an image'],
    ['| a | b |', 'a table'],
    ['```', 'a code fence'],
    ['    indented', 'an indented line'],
    ['---', 'a rule'],
  ])('refuses %s (%s) naming the line', (line) => {
    expect(() => parseStandard(`# T\n\nok\n\n${line}\n`)).toThrow(/line 5: /);
  });

  // Codex review on #42: a paragraph joins its lines, so the error must still
  // name the line the construct is on, not the line the paragraph starts on.
  it('names the continuation line, not the paragraph start, for an inline failure', () => {
    expect(() => parseStandard('# T\n\nfirst\ncontinued with <b>x</b>\n')).toThrow(/line 4: /);
    expect(() => parseStandard('# T\n\nfirst\nsecond\nthird **dangling\n')).toThrow(/line 5: /);
  });

  it('refuses a text line right after a list item: Markdown would continue the item', () => {
    expect(() => parseStandard('# T\n\n- one\ncontinued\n')).toThrow(/line 4: /);
  });
});

describe('renderStandard inline text', () => {
  function body(markdown: string): string {
    const html = renderStandard({ ...OPTIONS, markdown });
    return html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  }

  it('renders bold, code, and https links, escaping everything else', () => {
    const html = body(FIXTURE);
    expect(html).toContain('<h1>Title, v0.1</h1>');
    expect(html).toContain('<p>A paragraph over two lines.</p>');
    expect(html).toContain('<h2>Second</h2>');
    expect(html).toContain('<li><strong>One:</strong> first item</li>');
    expect(html).toContain(
      '<li>Two with <code>code</code> and a <a href="https://example.org/a?b=c">link</a>.</li>'
    );
    expect(html).toContain('<p>Trailing &amp; &quot;quotes&quot; and &#39;apostrophes&#39;.</p>');
  });

  it.each([
    ['an `unclosed code span', 'an unclosed code span'],
    ['a **dangling bold', 'an unclosed bold'],
    ['a [link](http://insecure.example/) in clear', 'an http link'],
    ['a [link](/standard) that is relative', 'a relative link'],
    ['a [text] alone', 'a bare bracket'],
    ['a <b>tag</b> in the text', 'raw HTML'],
    ['a > b', 'an angle bracket'],
    ['**bold with `code` inside**', 'nesting'],
  ])('refuses %s (%s) naming the line', (text) => {
    expect(() => renderStandard({ ...OPTIONS, markdown: `# T\n\n${text}\n` })).toThrow(/line 3: /);
  });
});

describe('the real docs/mcp-standard.md', () => {
  const html = renderStandard({ ...OPTIONS, markdown: STANDARD });

  it('carries the version in the heading and every criterion as a bold lead', () => {
    expect(html).toContain('<h1>The MCP server standard, v0.1</h1>');
    const leads = [...html.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
    expect(leads).toEqual([
      'Has clearly defined tools:',
      'Is self-describing:',
      'Is transparent about versions:',
      'Uses standard identifiers:',
      'Is flexible with references:',
      'Is faithful to the text:',
      'Has high uptime:',
      'Is transparent about its status:',
      'Handles errors properly:',
      'Delivers content reliably:',
      'Is economical with context:',
    ]);
  });

  it('invites suggestions by GitHub issue (ADR 0008, decision 5)', () => {
    expect(html).toContain('href="https://github.com/unfoldingWord/servant.bible/issues/new"');
    expect(html).toContain('version 0.1 of our understanding');
  });

  it('is a complete document in the site design with no script', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<title>MCP server standard · Servant.Bible</title>');
    expect(html).toContain(OPTIONS.css);
    expect(html).toContain('Servant.Bible 9.9.9 · generated from docs/mcp-standard.md');
    expect(html).not.toContain('generated from servers.json');
    expect(html).not.toContain('<script');
    const links = html.match(/<link[^>]*>/g) ?? [];
    for (const link of links) expect(link).toMatch(/href="https:\/\/fonts\.googleapis\.com\//);
  });
});

describe('the standard page’s links', () => {
  const html = renderStandard({ ...OPTIONS, markdown: STANDARD });

  it('carries the nav home and the sign-out form, like the page', () => {
    expect(html).toContain('<a class="brand" href="/">');
    expect(html).toContain('<li><a href="/">Servers</a></li>');
    expect(html).toContain(
      '<form class="sign-out" method="post" action="/sign-out"><button type="submit">Sign out</button></form>'
    );
  });

  it('links and posts only to addresses the router answers', () => {
    const internal = [...html.matchAll(/(?:href|action)="(\/[^"]*)"/g)].map((m) => m[1] ?? '');
    expect(internal).toContain('/');
    expect(internal).toContain('/sign-out');
    for (const target of internal) {
      expect(parseRoute(target).kind, target).not.toBe('unknown');
    }
  });
});
