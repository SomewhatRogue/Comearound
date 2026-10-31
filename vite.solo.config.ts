// Solo build: one self-contained HTML file (game, room and bots inlined), for the shareable link.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  root: 'src/client',
  define: { 'import.meta.env.VITE_SOLO': JSON.stringify('1') },
  plugins: [viteSingleFile()],
  build: { outDir: '../../dist-solo', emptyOutDir: true, assetsInlineLimit: 100_000_000 },
});
