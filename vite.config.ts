import { defineConfig } from 'vite';
// On Vercel, invites made on a deployment-specific URL (behind Vercel's sign-in, Standard
// Deployment Protection) must point at the public production domain. Vercel sets these at build time.
const site = process.env.VITE_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '';
export default defineConfig({
  root: 'src/client',
  define: {
    'import.meta.env.VITE_SITE_URL': JSON.stringify(site),
    // This deployment's own URLs (behind Vercel's sign-in): invites made there use the site instead.
    'import.meta.env.VITE_PRIVATE_HOSTS': JSON.stringify([process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean).join(',')),
  },
  build: { outDir: '../../dist', emptyOutDir: true },
});
