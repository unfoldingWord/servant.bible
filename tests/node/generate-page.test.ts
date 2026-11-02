import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { generatePage } from '../../scripts/generate-page.mjs';

/**
 * The generator is the build step that turns servers.json into
 * public/index.html. It refuses an invalid list, so a bad entry fails the
 * build rather than reaching a deploy (#9), and refuses a standard it cannot
 * render (ADR 0008). Paths are injected so the test never touches the real
 * public/ directory.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const SERVERS = path.join(ROOT, 'servers.json');
const SCHEMA = path.join(ROOT, 'servers.schema.json');

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'servant-page-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('generatePage', () => {
  it('writes the page for the real list into a directory it creates', () => {
    const outPath = path.join(scratch(), 'nested', 'index.html');

    const html = generatePage({ serversPath: SERVERS, schemaPath: SCHEMA, outPath });

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(readFileSync(outPath, 'utf8')).toBe(html);
  });

  it('writes the two sign-in pages beside it (ADR 0007)', () => {
    const dir = path.join(scratch(), 'site');
    const outPath = path.join(dir, 'index.html');

    generatePage({ serversPath: SERVERS, schemaPath: SCHEMA, outPath });

    const plain = readFileSync(path.join(dir, 'sign-in.html'), 'utf8');
    const failed = readFileSync(path.join(dir, 'sign-in-failed.html'), 'utf8');
    expect(plain).toContain('action="/sign-in"');
    expect(plain).not.toContain('class="form-error"');
    expect(failed).toContain('class="form-error"');
  });

  it('throws naming every error and writes nothing when the list is invalid', () => {
    const dir = scratch();
    const serversPath = path.join(dir, 'servers.json');
    const outPath = path.join(dir, 'index.html');
    const real = JSON.parse(readFileSync(SERVERS, 'utf8')) as { entries: unknown[] };
    const first = real.entries[0];
    writeFileSync(serversPath, JSON.stringify({ ...real, entries: [first, first] }));

    expect(() => generatePage({ serversPath, schemaPath: SCHEMA, outPath })).toThrow(
      /duplicate org\/server/
    );
    expect(existsSync(outPath)).toBe(false);
    expect(existsSync(path.join(dir, 'sign-in.html'))).toBe(false);
    expect(existsSync(path.join(dir, 'sign-in-failed.html'))).toBe(false);
    expect(existsSync(path.join(dir, 'standard.html'))).toBe(false);
  });
});

describe('generatePage and the standard (ADR 0008)', () => {
  it('writes the standard beside the page', () => {
    const dir = path.join(scratch(), 'site');
    const outPath = path.join(dir, 'index.html');

    generatePage({ serversPath: SERVERS, schemaPath: SCHEMA, outPath });

    const standard = readFileSync(path.join(dir, 'standard.html'), 'utf8');
    expect(standard).toContain('<h1>The MCP server standard, v0.1</h1>');
    expect(standard).toContain('action="/sign-out"');
  });

  it('throws naming the line and writes nothing when the standard has a construct it cannot render', () => {
    const dir = scratch();
    const standardPath = path.join(dir, 'mcp-standard.md');
    const outPath = path.join(dir, 'index.html');
    writeFileSync(standardPath, '# T\n\n> a quote the renderer does not know\n');

    expect(() =>
      generatePage({ serversPath: SERVERS, schemaPath: SCHEMA, standardPath, outPath })
    ).toThrow(/mcp-standard\.md line 3: /);
    expect(existsSync(outPath)).toBe(false);
    expect(existsSync(path.join(dir, 'standard.html'))).toBe(false);
  });
});
