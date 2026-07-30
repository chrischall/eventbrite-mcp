import type { ConnectorAuth } from '@chrischall/mcp-connector';
import { EventbriteClient } from './client.js';

/**
 * OAuth props stored per user by the Cloudflare connector's OAuth provider.
 *
 * Eventbrite issues a long-lived personal OAuth token (no refresh cycle), so
 * we only store the token itself. It is encrypted at rest in OAUTH_KV by the
 * OAuth provider and turned back into a per-user `EventbriteClient` by
 * `worker.ts`'s `buildClient`.
 */
export interface EventbriteProps {
  token: string;
  [key: string]: unknown;
}

/**
 * `ConnectorAuth` for the Eventbrite remote connector: the login page collects
 * the user's personal Eventbrite token (eventbrite.com/platform/api-keys),
 * verifies it against the current-user endpoint (a bad token throws, which
 * the connector surfaces back on the login page), and stores `{ token }`.
 */
export const eventbriteAuth: ConnectorAuth<EventbriteProps> = {
  service: 'Eventbrite',
  accent: '#F05537',
  privacyNote:
    'Your Eventbrite private token is stored encrypted and used only to call the Eventbrite API on your behalf.',
  fields: [{ name: 'token', label: 'Eventbrite private token', type: 'password' }],
  async login(fields) {
    const client = new EventbriteClient({ token: fields.token });
    await client.request('GET', '/users/me/');
    return { token: fields.token };
  },
};
