// Auth guard for every route except the login pair. Also stamps noindex on
// all responses — the admin must never appear in search.
import { defineMiddleware } from 'astro:middleware';
import { COOKIE_NAME, verifyToken } from './lib/auth';

const OPEN_PATHS = new Set(['/admin/login', '/admin/api/login']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  if (!OPEN_PATHS.has(pathname) && !verifyToken(ctx.cookies.get(COOKIE_NAME)?.value)) {
    // Absolute URL, not a relative path: Vercel's edge appears to try to
    // resolve same-origin relative redirects against its own routing table
    // internally rather than just returning them to the client, which for
    // this route (no explicit `status` override in the generated routing
    // config) produced a genuine 508 INFINITE_LOOP. An absolute URL avoids
    // whatever internal-rewrite path that triggers.
    return ctx.redirect(new URL('/admin/login', ctx.url).href);
  }
  const res = await next();
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
});
