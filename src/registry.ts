/**
 * The typed view of servers.json (ADR 0005). The schema gate guarantees the
 * file's shape before it is bundled; `loadRegistry` narrows the JSON import to
 * these types and checks the fields the router depends on, so a bad bundle
 * fails at startup with a message instead of at the first request.
 */

export type Kind = 'server' | 'dataset';
export type Status = 'available' | 'planned' | 'degraded' | 'retired';
export type Transport = 'json-rpc' | 'streamable-http';

export interface Version {
  /** Full https URL of the MCP endpoint the router forwards to. */
  backend: string;
  transport: Transport;
  /** Name of a service binding in wrangler.toml (ADR 0003, decision 8). */
  binding?: string;
  auth?: 'bearer';
}

export interface Operator {
  name: string;
  url?: string;
  contact?: string;
}

export interface Source {
  name: string;
  url: string;
}

export interface Entry {
  kind: Kind;
  status: Status;
  org: string;
  server: string;
  shorthand?: string;
  name: string;
  description: string;
  purpose: string;
  operator: Operator;
  sources?: Source[];
  repository?: string;
  resources?: string[];
  current?: string;
  versions?: Record<string, Version>;
}

export interface Registry {
  entries: Entry[];
}

const KINDS: readonly string[] = ['server', 'dataset'];
const STATUSES: readonly string[] = ['available', 'planned', 'degraded', 'retired'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkEntry(value: unknown, index: number): Entry {
  if (!isRecord(value)) throw new Error(`servers.json: entries[${index}] is not an object`);
  const { kind, status, org, server } = value;
  if (typeof kind !== 'string' || !KINDS.includes(kind)) {
    throw new Error(`servers.json: entries[${index}].kind is not one of ${KINDS.join(', ')}`);
  }
  if (typeof status !== 'string' || !STATUSES.includes(status)) {
    throw new Error(`servers.json: entries[${index}].status is not one of ${STATUSES.join(', ')}`);
  }
  if (typeof org !== 'string' || typeof server !== 'string') {
    throw new Error(`servers.json: entries[${index}] needs string org and server`);
  }
  return value as unknown as Entry;
}

/** Narrow a parsed servers.json to a Registry, or throw with the first problem. */
export function loadRegistry(doc: unknown): Registry {
  if (!isRecord(doc) || !Array.isArray(doc.entries)) {
    throw new Error('servers.json: no entries array');
  }
  return { entries: doc.entries.map(checkEntry) };
}

/** Whether the router forwards to this entry (ADR 0005, decision 2). */
export function isRoutable(entry: Entry): boolean {
  return entry.kind === 'server' && (entry.status === 'available' || entry.status === 'degraded');
}

export function routableCount(registry: Registry): number {
  return registry.entries.filter(isRoutable).length;
}

export function findEntry(registry: Registry, org: string, server: string): Entry | undefined {
  return registry.entries.find((entry) => entry.org === org && entry.server === server);
}

export function findByShorthand(registry: Registry, shorthand: string): Entry | undefined {
  return registry.entries.find((entry) => entry.shorthand === shorthand);
}

/** The version under `key`, without indexing by a caller-supplied string. */
export function versionOf(entry: Entry, key: string): Version | undefined {
  return Object.entries(entry.versions ?? {}).find(([name]) => name === key)?.[1];
}
