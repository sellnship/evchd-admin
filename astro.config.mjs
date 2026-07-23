// Admin panel — server-rendered on Vercel (its own Vercel project with
// Root Directory = admin). All pages are dynamic: they read/write Neon and
// call the GitHub API, so nothing is prerendered.
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  // maxDuration: AI routes (hero generation via fal.ai, topic suggestions via
  // LLM) can take 20-60s — well past the default function timeout.
  adapter: vercel({ maxDuration: 60 }),
});
