// Admin panel — server-rendered on Vercel (its own Vercel project with
// Root Directory = admin). All pages are dynamic: they read/write Neon and
// call the GitHub API, so nothing is prerendered.
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  // Served at www.evchandigarh.in/admin via a rewrite in the main site's
  // vercel.json. Pages live under src/pages/admin/ (plain file-based
  // routing) rather than using Astro's `base` option — the @astrojs/vercel
  // adapter doesn't carry `base` into its generated Vercel routing config,
  // which produced an edge<->function redirect loop (see withastro/astro#9942,
  // withastro/adapters#418). Every internal link/redirect already hardcodes
  // the /admin/ prefix, so nesting the pages achieves the same URLs without
  // depending on adapter base-path support.
  // maxDuration: AI routes (image generation, topic suggestions via LLM) can
  // take 20-60s — well past the default function timeout.
  adapter: vercel({ maxDuration: 60 }),
});
