import { defineConfig } from 'vite';
// On Vercel, invite links must use the project's public production domain: deployment-specific
// URLs sit behind Vercel's sign-in (Standard Deployment Protection). Vercel sets this at build time.
const site = process.env.VITE_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '';
export default defineConfig({
  root: 'src/client',
  define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(site) },
  build: { outDir: '../../dist', emptyOutDir: true },
});
