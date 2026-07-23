// Admin panel — server-rendered on Vercel (its own Vercel project with
// Root Directory = admin). All pages are dynamic: they read/write Neon and
// call the GitHub API, so nothing is prerendered.
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  // Served at www.evchandigarh.in/admin via a rewrite in the main site's
  // vercel.json — every route/link/redirect lives under this base.
  base: '/admin',
  // maxDuration: AI routes (image generation, topic suggestions via LLM) can
  // take 20-60s — well past the default function timeout.
  adapter: vercel({ maxDuration: 60 }),
});
