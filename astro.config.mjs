// Admin panel — its own Vercel project (Root Directory = admin). Every page
// and API route is dynamic (Neon reads/writes, GitHub API calls), gated via
// explicit `export const prerender = false` rather than `output: 'server'`.
//
// `output: 'server'` produced a 508 INFINITE_LOOP_DETECTED from Vercel's
// edge on every dynamic route — reproduced across two separate Vercel
// projects/accounts and two major astro/@astrojs/vercel version combos,
// while the deployed function behaved correctly when invoked directly
// (bypassing Vercel's routing), meaning the loop was in how Vercel's edge
// routes `server`-output builds, not in this app's own code. Confirmed
// against a working sibling project (gmadanew-inspect / gmada.in) running
// the identical astro@^7 + @astrojs/vercel@^11 combo with `output: 'static'`
// + per-route `prerender = false` in production with no issue — matching
// that proven pattern here instead of chasing the `server`-output bug.
//
// Pages live under src/pages/admin/ (plain file-based routing) rather than
// using Astro's `base` option — the adapter doesn't carry `base` into its
// generated Vercel routing config, which separately produced its own
// edge<->function redirect loop (see withastro/astro#9942,
// withastro/adapters#418). Every internal link/redirect already hardcodes
// the /admin/ prefix, so nesting the pages achieves the same URLs without
// depending on adapter base-path support.
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'static',
  // Renamed from the default `_astro` so this app's built CSS/JS never
  // collides with the main site's own `_astro/*` bundle — both are Astro
  // projects, and the main site's vercel.json needs to proxy this app's
  // assets through a path that's unambiguously *not* also the main site's
  // own asset folder.
  build: { assets: '_admin-astro' },
  // maxDuration: AI routes (image generation, topic suggestions via LLM) can
  // take 20-60s — well past the default function timeout.
  adapter: vercel({ maxDuration: 60 }),
});
