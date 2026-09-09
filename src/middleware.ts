// Auth guard for every route except the login pair. Also stamps noindex on
// all responses — the admin must never appear in search.
import { defineMiddleware } from 'astro:middleware';
import { COOKIE_NAME, verifyToken } from './lib/auth';

const OPEN_PATHS = new Set(['/admin/login', '/admin/api/login']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  if (!OPEN_PATHS.has(pathname) && !verifyToken(ctx.cookies.get(COOKIE_NAME)?.value)) {
    // Relative path, not an absolute URL: this app is only ever reached
    // through the main site's rewrite (www.evchandigarh.in/admin -> this
    // deployment), which is a transparent proxy from the browser's point of
    // view. An absolute URL built from ctx.url resolves to *this backend's*
    // real host (evchd-admin.vercel.app) rather than the public-facing one,
    // and since this is a real redirect (not a rewrite), the browser follows
    // it and the address bar leaks the raw backend URL. A relative path
    // keeps the browser on whatever host it already believes it's on.
    return ctx.redirect('/admin/login');
  }
  const res = await next();
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
});
