import { describe, expect, it } from 'vitest';

import { renderPage } from '../../scripts/page/render.mjs';
import servers from '../../servers.json';
import type { Entry } from '../../src/registry.js';
import { parseRoute } from '../../src/routes.js';

/**
 * The page (#9) is rendered from the list and nothing else. These tests pin
 * what it shows for each kind and status (ADR 0005), how it tells a server
 * unfoldingWord runs from one it blesses (ADR 0004), and what it must never
 * show: backends, bindings, and whether a server wants a credential.
 */

const OPTIONS = { css: '.fixture-css{}', script: 'void 0; /* fixture-script */', version: '9.9.9' };

const LIVE = ['available', 'degraded'];

/** A fixture entry; versions only when its status means the router forwards it. */
function entry(overrides: Partial<Entry> & Pick<Entry, 'org' | 'server'>): Entry {
  const routed = LIVE.includes(overrides.status ?? 'available');
  const versions = {
    current: 'v1',
    versions: { v1: { backend: 'https://backend.example/v1/mcp', transport: 'json-rpc' } },
  } as const;
  return {
    kind: 'server',
    status: 'available',
    name: `Name of ${overrides.org} ${overrides.server}`,
    description: 'Fixture description.',
    purpose: 'Fixture purpose.',
    operator: { name: 'unfoldingWord', url: 'https://unfoldingword.org' },
    ...(routed ? versions : {}),
    ...overrides,
  };
}

function render(entries: Entry[]): string {
  return renderPage({ entries }, OPTIONS);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe('the real servers.json', () => {
  const html = renderPage(servers, OPTIONS);

  it('renders one card or tile per entry and no others', () => {
    expect(count(html, 'data-entry="')).toBe(servers.entries.length);
    for (const item of servers.entries) {
      expect(count(html, `data-entry="${item.org}/${item.server}"`)).toBe(1);
      expect(count(html, `<h3>${item.name}</h3>`)).toBe(1);
    }
  });

  it('never prints a backend', () => {
    for (const item of servers.entries) {
      for (const version of Object.values(item.versions ?? {})) {
        expect(html).not.toContain(version.backend);
      }
    }
    expect(html).not.toContain('workers.dev');
  });

  it('inlines the stylesheet and the script and loads nothing but the fonts', () => {
    expect(html).toContain(OPTIONS.css);
    expect(html).toContain(OPTIONS.script);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).not.toContain('fetch(');
    const links = html.match(/<link[^>]*>/g) ?? [];
    for (const link of links) expect(link).toMatch(/href="https:\/\/fonts\.googleapis\.com\//);
  });

  it('is a complete document with the version in the colophon', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<title>Servant.Bible</title>');
    expect(html).toContain('Servant.Bible 9.9.9');
  });

  it('carries the page-level links', () => {
    expect(html).toContain('href="/mcp.json"');
    expect(html).toContain(
      'href="https://github.com/unfoldingWord/servant.bible/blob/main/docs/adding-a-server.md"'
    );
  });

  // The MCP standard (#20) has no route yet, so the page must not link it:
  // a primary action that answers 404 is worse than no action. #20 adds the
  // link with the route. Until then every internal link is one the router
  // answers.
  it('links only to addresses the router answers', () => {
    const internal = [...html.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1] ?? '');
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) {
      expect(parseRoute(href).kind, href).not.toBe('unknown');
    }
    expect(html).not.toContain('/standard');
  });
});

describe('operator distinction (ADR 0004)', () => {
  // The org slug is the canonical operator identity (ADR 0002): `uw` is
  // unfoldingWord whatever the display name says, and any other org is not.
  it('marks a server under org uw as run by unfoldingWord', () => {
    const html = render([entry({ org: 'uw', server: 'ours' })]);
    expect(html).toContain('class="operator"');
    expect(html).toContain('href="https://unfoldingword.org"');
    expect(html).not.toContain('blessed by');
  });

  it('decides by org, not by the display name, in both directions', () => {
    const odd = render([
      entry({ org: 'uw', server: 'ours', operator: { name: 'UnfoldingWord' } }),
      entry({ org: 'other', server: 'theirs', operator: { name: 'unfoldingWord' } }),
    ]);
    expect(odd).toContain('<p class="operator">Run by <span class="chip">UnfoldingWord</span></p>');
    expect(odd).toContain(
      '<p class="operator operator-blessed">Run by <span class="chip">unfoldingWord</span> blessed by unfoldingWord</p>'
    );
  });

  it('marks a server someone else runs as blessed, naming the operator', () => {
    const html = render([entry({ org: 'klappy', server: 'theirs', operator: { name: 'Klappy' } })]);
    expect(html).toContain('class="operator operator-blessed"');
    expect(html).toContain('<span class="chip">Klappy</span> blessed by unfoldingWord');
  });
});

describe('addresses and versions (ADR 0002)', () => {
  const html = render([
    entry({
      org: 'uw',
      server: 'alpha',
      shorthand: 'al',
      current: 'v2',
      versions: {
        v1: { backend: 'https://a.example/v1/mcp', transport: 'json-rpc' },
        v2: { backend: 'https://a.example/v2/mcp', transport: 'streamable-http' },
      },
    }),
    entry({ org: 'uw', server: 'beta' }),
  ]);

  it('shows the canonical endpoint with a copy button', () => {
    const endpoint = 'https://servant.bible/org/uw/server/alpha/mcp';
    expect(html).toContain(`<code>${endpoint}</code>`);
    expect(html).toContain(`data-copy="${endpoint}"`);
  });

  it('shows the shorthand only when the entry has one', () => {
    expect(html).toContain('<code>https://servant.bible/s/al</code>');
    expect(count(html, 'Shorthand')).toBe(1);
  });

  it('lists every version with its pinned address and transport, marking the current one', () => {
    expect(html).toContain('/org/uw/server/alpha/v1/mcp');
    expect(html).toContain('/org/uw/server/alpha/v2/mcp');
    expect(html).toContain('<li class="version"><span class="tag">v1</span>');
    expect(html).toContain('<li class="version version-current"><span class="tag">v2</span>');
    expect(html).toContain('<span class="transport">json-rpc</span>');
    expect(html).toContain('<span class="transport">streamable-http</span>');
  });
});

describe('kind and status (ADR 0005)', () => {
  const html = render([
    entry({ org: 'uw', server: 'live' }),
    entry({ org: 'uw', server: 'shaky', status: 'degraded' }),
    entry({ org: 'uw', server: 'soon', kind: 'dataset', status: 'planned' }),
    entry({ org: 'uw', server: 'old', status: 'retired' }),
  ]);

  function section(id: string): string {
    const start = html.indexOf(`id="${id}"`);
    expect(start, id).toBeGreaterThan(-1);
    const end = html.indexOf('</section>', start);
    return html.slice(start, end);
  }

  it('puts available and degraded servers under Servers, with the status shown', () => {
    const servers = section('servers');
    expect(servers).toContain('data-entry="uw/live"');
    expect(servers).toContain('status status-available');
    expect(servers).toContain('data-entry="uw/shaky"');
    expect(servers).toContain('status status-degraded');
  });

  it('shows planned entries as coming, with the reserved slug and no endpoint', () => {
    const coming = section('coming');
    expect(coming).toContain('data-entry="uw/soon"');
    expect(coming).toContain('status status-planned');
    expect(coming).toContain('dataset · org/uw/server/soon');
    expect(coming).not.toContain('/org/uw/server/soon/mcp');
  });

  it('lists retired entries in their own section, only when there are any', () => {
    expect(section('retired')).toContain('data-entry="uw/old"');
    expect(render([entry({ org: 'uw', server: 'live' })])).not.toContain('id="retired"');
  });

  it('counts live servers, planned entries, and distinct operators', () => {
    expect(html).toMatch(/<span class="n">2<\/span><span class="l">servers live/);
    expect(html).toMatch(/<span class="n">1<\/span><span class="l">planned/);
    expect(html).toMatch(/<span class="n">1<\/span><span class="l">operator/);
  });
});

describe('optional fields', () => {
  it('links the repository, the documentation, and each source when present', () => {
    const html = render([
      entry({
        org: 'uw',
        server: 'full',
        repository: 'https://github.com/unfoldingWord/full',
        documentation: 'https://docs.example/full',
        sources: [{ name: 'DCS', url: 'https://git.door43.org' }],
        resources: ['bible', 'media'],
      }),
    ]);
    expect(html).toContain('href="https://github.com/unfoldingWord/full"');
    expect(html).toContain('href="https://docs.example/full"');
    expect(html).toContain('href="https://git.door43.org">DCS</a>');
    expect(html).toContain('<li>bible</li><li>media</li>');
  });

  it('omits the links row and badges when the entry has none', () => {
    const html = render([entry({ org: 'uw', server: 'bare' })]);
    expect(html).not.toContain('Documentation');
    expect(html).not.toContain('Repository');
    expect(html).not.toContain('class="badges"');
  });
});

describe('what a consumer must not learn from the page', () => {
  it('never shows that a server wants a credential or how the router reaches it', () => {
    const html = render([
      entry({
        org: 'uw',
        server: 'guarded',
        versions: {
          v1: {
            backend: 'https://g.example/mcp',
            transport: 'json-rpc',
            auth: 'bearer',
            binding: 'ZZ_BOUND',
          },
        },
      }),
    ]);
    expect(html).not.toContain('bearer');
    expect(html).not.toContain('g.example');
    expect(html).not.toContain('ZZ_BOUND');
  });
});

describe('escaping', () => {
  it('escapes every string from the list, in text and in attributes', () => {
    const html = render([
      entry({
        org: 'uw',
        server: 'evil',
        name: 'A <script>alert(1)</script> & "name"',
        description: "<img src=x onerror='1'>",
        operator: { name: 'O "quoted" <b>', url: 'https://unfoldingword.org/?a=1&b=2' },
      }),
    ]);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;name&quot;');
    expect(html).toContain('href="https://unfoldingword.org/?a=1&amp;b=2"');
  });
});
