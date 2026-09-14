import { createSign } from 'crypto';
import { env } from './env';

// Google Indexing API — lets us tell Google directly "this URL is gone" on
// unpublish (URL_DELETED) or "this URL changed" on publish (URL_UPDATED),
// instead of waiting for the next organic crawl to notice. This is a
// hurry-up signal, not a guarantee: Google still re-crawls to confirm before
// actually dropping/refreshing the URL in search results. No-ops silently
// when the two env vars below aren't configured yet (same pattern as
// deploy_hook_url being unset).
const SCOPE = 'https://www.googleapis.com/auth/indexing';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PUBLISH_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const SITE = 'https://www.evchandigarh.in';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function googleIndexingConfigured(): boolean {
  return Boolean(env('GOOGLE_INDEXING_CLIENT_EMAIL') && env('GOOGLE_INDEXING_PRIVATE_KEY'));
}

async function getAccessToken(): Promise<string | null> {
  const clientEmail = env('GOOGLE_INDEXING_CLIENT_EMAIL');
  const privateKey = env('GOOGLE_INDEXING_PRIVATE_KEY').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signature = base64url(createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey));
  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Absolute live URL for an article, matching the main site's routing (blog / hi/blog). */
export function articleUrl(slug: string, lang: 'en' | 'hi'): string {
  return lang === 'hi' ? `${SITE}/hi/blog/${slug}` : `${SITE}/blog/${slug}`;
}

/**
 * Fire-and-log, never throws -- a Google API hiccup should never block a
 * publish/unpublish action the admin is waiting on.
 */
export async function notifyGoogleIndexing(url: string, type: 'URL_UPDATED' | 'URL_DELETED'): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(PUBLISH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type }),
    });
    if (!res.ok) console.error('Google Indexing API error:', res.status, await res.text());
  } catch (e: any) {
    console.error('Google Indexing API request failed:', e?.message ?? e);
  }
}
