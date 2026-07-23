// Admin panel — server-rendered on Vercel (its own Vercel project with
// Root Directory = admin). All pages are dynamic: they read/write Neon and
// call the GitHub API, so nothing is prerendered.
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
});
