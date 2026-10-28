import { describe, expect, it } from 'vitest';

import { validateServers } from '../../scripts/validate-servers.mjs';
import schema from '../../servers.schema.json';
import servers from '../../servers.json';

/**
 * The validator runs under Node (ajv compiles schemas with `new Function`,
 * which the Workers runtime refuses), so this file lives in the `node` vitest
 * project. Every rule in the schema and every cross-entry rule in the script
 * has a case here: a bad fixture must fail and the base fixture must pass.
 */

type Entry = Record<string, unknown>;

const BACKEND = 'https://example.org/mcp';

function baseServer(overrides: Entry = {}): Entry {
  return {
    kind: 'server',
    status: 'available',
    org: 'uw',
    server: 'tc-helps',
    shorthand: 'tc-helps',
    name: 'Translation Helps',
    description: 'Door43 translation helps.',
    purpose: 'Translators who need notes and questions for a passage.',
    operator: { name: 'unfoldingWord' },
    current: 'v1',
    versions: { v1: { backend: BACKEND, transport: 'json-rpc' } },
    ...overrides,
  };
}

function baseDataset(overrides: Entry = {}): Entry {
  return {
    kind: 'dataset',
    status: 'planned',
    org: 'uw',
    server: 'strategic-languages',
    name: 'Strategic Languages',
    description: 'The list of Strategic Languages and its data.',
    purpose: 'Tools that need the official list of Strategic Languages.',
    operator: { name: 'unfoldingWord' },
    ...overrides,
  };
}

function errorsFor(entries: Entry[]): string[] {
  return validateServers({ $schema: './servers.schema.json', entries }, schema);
}

function withoutKey(entry: Entry, key: string): Entry {
  return Object.fromEntries(Object.entries(entry).filter(([name]) => name !== key));
}

describe('servers.json in this repository', () => {
  it('validates against servers.schema.json with no errors', () => {
    expect(validateServers(servers, schema)).toEqual([]);
  });

  it('lists at least one server and one dataset', () => {
    const kinds = new Set(servers.entries.map((entry) => entry.kind));
    expect(kinds).toEqual(new Set(['server', 'dataset']));
  });
});

describe('base fixtures', () => {
  it('accepts a complete server entry', () => {
    expect(errorsFor([baseServer()])).toEqual([]);
  });

  it('accepts a planned dataset entry with no versions', () => {
    expect(errorsFor([baseDataset()])).toEqual([]);
  });

  it('accepts a planned server with no versions yet', () => {
    const planned = withoutKey(
      withoutKey(baseServer({ status: 'planned' }), 'versions'),
      'current'
    );
    expect(errorsFor([planned])).toEqual([]);
  });

  it('accepts optional fields: sources, repository, resources, binding, auth', () => {
    const entry = baseServer({
      sources: [{ name: 'Door43 Content Service', url: 'https://git.door43.org' }],
      repository: 'https://github.com/unfoldingWord/translation-helps-mcp',
      resources: ['bible', 'translation-notes'],
      versions: {
        v1: { backend: BACKEND, transport: 'streamable-http', binding: 'TC_HELPS', auth: 'bearer' },
      },
    });
    expect(errorsFor([entry])).toEqual([]);
  });
});

describe('slug rules', () => {
  it('rejects an uppercase org slug and names the path', () => {
    const errors = errorsFor([baseServer({ org: 'UW' })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('/entries/0/org');
  });

  it('rejects a server slug with a trailing hyphen', () => {
    expect(errorsFor([baseServer({ server: 'tc-helps-' })])).toHaveLength(1);
  });

  it('rejects a shorthand with a dot', () => {
    expect(errorsFor([baseServer({ shorthand: 'tc.helps' })])).toHaveLength(1);
  });
});

describe('required fields and enums', () => {
  it.each(['kind', 'status', 'org', 'server', 'name', 'description', 'purpose', 'operator'])(
    'rejects an entry missing %s',
    (key) => {
      expect(errorsFor([withoutKey(baseServer(), key)]).length).toBeGreaterThan(0);
    }
  );

  it('rejects an unknown kind', () => {
    expect(errorsFor([baseServer({ kind: 'tool' })]).length).toBeGreaterThan(0);
  });

  it('rejects an unknown status', () => {
    expect(errorsFor([baseServer({ status: 'disabled' })]).length).toBeGreaterThan(0);
  });

  it('rejects a field the schema does not define', () => {
    const errors = errorsFor([baseServer({ listed: false })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('listed');
  });

  it('rejects an empty purpose', () => {
    expect(errorsFor([baseServer({ purpose: '' })])).toHaveLength(1);
  });

  it('rejects a resource slug outside the canonical list', () => {
    expect(errorsFor([baseServer({ resources: ['notes'] })]).length).toBeGreaterThan(0);
  });

  it('rejects an empty sources array', () => {
    expect(errorsFor([baseServer({ sources: [] })])).toHaveLength(1);
  });

  it('rejects a source without a url', () => {
    expect(errorsFor([baseServer({ sources: [{ name: 'DCS' }] })])).toHaveLength(1);
  });
});

describe('versions', () => {
  it('rejects an available server with no versions', () => {
    const errors = errorsFor([withoutKey(withoutKey(baseServer(), 'versions'), 'current')]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a degraded server with no versions', () => {
    const entry = withoutKey(withoutKey(baseServer({ status: 'degraded' }), 'versions'), 'current');
    expect(errorsFor([entry]).length).toBeGreaterThan(0);
  });

  it('rejects a dataset that carries versions', () => {
    const entry = baseDataset({
      current: 'v1',
      versions: { v1: { backend: BACKEND, transport: 'json-rpc' } },
    });
    expect(errorsFor([entry]).length).toBeGreaterThan(0);
  });

  it('rejects a version key that is not v<number>', () => {
    const entry = baseServer({
      current: 'latest',
      versions: { latest: { backend: BACKEND, transport: 'json-rpc' } },
    });
    expect(errorsFor([entry]).length).toBeGreaterThan(0);
  });

  it('rejects an http backend', () => {
    const entry = baseServer({
      versions: { v1: { backend: 'http://example.org/mcp', transport: 'json-rpc' } },
    });
    expect(errorsFor([entry]).length).toBeGreaterThan(0);
  });

  it('rejects a transport BT Servant does not know', () => {
    const entry = baseServer({ versions: { v1: { backend: BACKEND, transport: 'sse' } } });
    expect(errorsFor([entry]).length).toBeGreaterThan(0);
  });

  it('rejects an auth value other than bearer', () => {
    const entry = baseServer({
      versions: { v1: { backend: BACKEND, transport: 'json-rpc', auth: 'basic' } },
    });
    expect(errorsFor([entry]).length).toBeGreaterThan(0);
  });
});

describe('cross-entry rules the schema cannot express', () => {
  it('rejects current that names no version', () => {
    const errors = errorsFor([baseServer({ current: 'v2' })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('/entries/0/current');
    expect(errors[0]).toContain('v2');
  });

  it('rejects two entries with the same org and server', () => {
    const errors = errorsFor([baseServer(), baseServer({ shorthand: 'other' })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('/entries/1/server');
    expect(errors[0]).toContain('uw/tc-helps');
  });

  it('rejects two entries with the same shorthand across organizations', () => {
    const errors = errorsFor([baseServer(), baseServer({ org: 'klappy' })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('/entries/1/shorthand');
    expect(errors[0]).toContain('tc-helps');
  });

  it('allows the same server slug under two organizations', () => {
    expect(errorsFor([baseServer(), baseServer({ org: 'klappy', shorthand: 'other' })])).toEqual(
      []
    );
  });
});

describe('document shape', () => {
  it('rejects a document without entries', () => {
    expect(validateServers({ $schema: './servers.schema.json' }, schema).length).toBeGreaterThan(0);
  });

  it('rejects a document that is not an object', () => {
    expect(validateServers('nope', schema).length).toBeGreaterThan(0);
  });

  it('reports every error, not only the first', () => {
    const errors = errorsFor([baseServer({ org: 'UW', server: 'Bad' })]);
    expect(errors).toHaveLength(2);
  });
});
