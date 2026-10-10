import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import paquete from './package.json';

/** La versión del sistema sale de package.json (ver CHANGELOG.md y scripts/version.sh). */
const { version } = paquete;

/**
 * En desarrollo, Vite sirve la web en 5173 y manda /api y /salud a la API.
 * En producción no hay proxy: la API sirve el build en su mismo puerto.
 */
export default defineConfig({
  plugins: [react()],
  define: { __JSDR_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3099', changeOrigin: true },
      '/salud': { target: 'http://127.0.0.1:3099', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // CodeMirror (el editor) en su propio archivo: cambia poco, así el
        // navegador lo guarda y no lo vuelve a bajar con cada versión de la web.
        manualChunks: { codemirror: ['@codemirror/state', '@codemirror/view', '@codemirror/commands', '@codemirror/search'] },
      },
    },
  },
});
