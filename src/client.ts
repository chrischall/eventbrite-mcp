import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadDotenvSafely, readEnvVar, createApiClient, type ApiClient } from '@chrischall/mcp-utils';

// Load .env for local dev; silently skip if dotenv is unavailable (e.g. mcpb
// bundle). `loadDotenvSafely` swallows a missing dotenv module and never lets
// .env override a host-provided value.
// The try/catch guards the Cloudflare Worker runtime, where `import.meta.url`
// is undefined and `fileURLToPath(undefined)` would throw at module init
// (Worker startup validation) — there is no filesystem / .env to load there.
try {
  const dir = dirname(fileURLToPath(import.meta.url));
  await loadDotenvSafely({ path: join(dir, '..', '.env'), override: false });
} catch {
  /* non-Node runtime (Workers): no .env to load */
}

const BASE_URL = 'https://www.eventbriteapi.com/v3';
const SERVICE_NAME = 'Eventbrite';

/**
 * Client for the documented Eventbrite API (`eventbriteapi.com/v3`) — the
 * server-side-reachable surface: your identity, your orders/tickets, the
 * organizations you belong to, and any event by id. Public event *search*
 * does not exist here (removed in 2019); that lives on the WAF-walled
 * consumer surface handled by `discovery.ts` via the browser bridge.
 */
export class EventbriteClient {
  private readonly token: string | null;
  private readonly configError: Error | null;
  private readonly api: ApiClient;

  /**
   * Defer the config error so the server can still start (and respond to the
   * host's install-time smoke test) when EVENTBRITE_TOKEN isn't set yet.
   * Tool calls re-raise the error at request time.
   *
   * Optional constructor seam: the hosted Cloudflare connector builds one
   * client per request with that user's `token` injected. The stdio path
   * passes no options, so the token resolves from the environment.
   * The constructor is PURE (no I/O, no randomness) — it is run in Worker
   * global scope via the module singleton below.
   */
  constructor(opts?: { token?: string }) {
    const token = opts?.token ?? readEnvVar('EVENTBRITE_TOKEN');
    if (!token) {
      this.token = null;
      this.configError = new Error(
        'EVENTBRITE_TOKEN environment variable is required (create a private token at https://www.eventbrite.com/platform/api-keys)'
      );
    } else {
      this.token = token;
      this.configError = null;
    }

    this.api = createApiClient({
      baseUrl: BASE_URL,
      getToken: () => this.requireToken(),
      serviceName: SERVICE_NAME,
      retry: { count: 1, delayMs: 2000 },
      timeout: 30_000,
      onUnauthorized: () =>
        new Error('EVENTBRITE_TOKEN is invalid or missing (eventbrite.com/platform/api-keys)'),
      onRateLimited: () => new Error('Rate limited by the Eventbrite API (default 2,000 calls/hour)'),
    });
  }

  private requireToken(): string {
    if (this.configError) throw this.configError;
    return this.token!;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.api.fetchJson<T>(method, path, body !== undefined ? { body } : {});
  }
}

/**
 * Module-level singleton shared by every tool module. Constructing it here (not
 * in `index.ts`) keeps the deferred-config-error pattern: the server boots and
 * answers the host's install-time tools/list smoke test even when the token is
 * absent — the error only surfaces on the first request.
 */
export const client = new EventbriteClient();
