// Auth guard for every route except the login pair. Also stamps noindex on
// all responses — the admin must never appear in search.
import { defineMiddleware } from 'astro:middleware';
import { COOKIE_NAME, verifyToken } from './lib/auth';

const OPEN_PATHS = new Set(['/admin/login', '/admin/api/login']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  if (!OPEN_PATHS.has(pathname) && !verifyToken(ctx.cookies.get(COOKIE_NAME)?.value)) {
    return ctx.redirect('/admin/login');
  }
  const res = await next();
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
});
