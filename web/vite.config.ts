import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo, Vite sirve la web en 5173 y manda /api y /salud a la API.
 * En producción no hay proxy: la API sirve el build en su mismo puerto.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3099', changeOrigin: true },
      '/salud': { target: 'http://127.0.0.1:3099', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
