import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * public/index.html is generated and not committed (#9), so every script
 * that starts the Workers tests has to generate it first or the page tests
 * meet a 404 on a fresh checkout. `test` has its `pretest`; `test:watch`
 * has no pre-script of its own, so it must call the generator itself.
 */

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const { scripts } = pkg;

describe('scripts that run vitest generate the page first', () => {
  const runners = Object.entries(scripts).filter(([, command]) => command.includes('vitest'));

  it('finds the test scripts', () => {
    expect(runners.map(([name]) => name).sort()).toEqual(['test', 'test:watch']);
  });

  it.each(runners)('%s generates before vitest', (name, command) => {
    const pre = scripts[`pre${name}`] ?? '';
    const generates = (text: string) => text.includes('pnpm run generate');
    expect(generates(pre) || command.startsWith('pnpm run generate &&'), name).toBe(true);
  });
});
