import type { APIRoute } from 'astro';
import { COOKIE_NAME, checkCredentials, makeToken } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');

  if (!checkCredentials(email, password)) return redirect('/admin/login?err=1');

  cookies.set(COOKIE_NAME, makeToken(), {
    httpOnly: true,
    secure: url.protocol === 'https:', // Secure in prod; plain http on localhost dev
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
  return redirect('/admin/');
};
