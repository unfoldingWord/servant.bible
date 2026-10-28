import schemaJson from '../servers.schema.json';
import serversJson from '../servers.json';
import { loadRegistry } from './registry.js';
import { createRouter, type Env } from './router.js';

/**
 * The Servant.Bible router Worker (ADR 0003). This file is the apex: every
 * request lands here. servers.json is bundled at build time, so a deploy is a
 * list change plus a push; there is no runtime fetch of the list and no KV.
 * The routes and forwarding rules live in router.ts and the modules it uses.
 */

export type { Env };

export default createRouter({
  registry: loadRegistry(serversJson),
  schema: schemaJson,
  fetch: (request) => fetch(request),
}) satisfies ExportedHandler<Env>;
