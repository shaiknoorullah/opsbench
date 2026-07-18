// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// Keystatic is a dev-only editor (git-backed content): its admin/API routes
// are mounted only when the CMS is explicitly requested, so production
// builds stay fully static.  npm run cms  ->  /keystatic
const cms = process.env.KEYSTATIC
  ? [(await import('@keystatic/astro')).default()]
  : [];

// https://astro.build/config
export default defineConfig({
  site: 'https://opsbench.vercel.app',
  integrations: [react(), sitemap(), mdx(), ...cms],
  output: 'static',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
