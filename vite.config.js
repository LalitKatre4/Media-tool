import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// SharedArrayBuffer (needed by the multi-threaded FFmpeg core) only exists
// when the page is "cross-origin isolated". These two headers turn that on.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // @ffmpeg/ffmpeg spawns its own module Worker via `new URL(..., import.meta.url)`.
  // Vite's dependency pre-bundling breaks that URL, so keep these packages out of it.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },

  // Dev server + `vite preview` both need the isolation headers.
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },

  // FFmpeg's worker uses ES module imports + code splitting; IIFE workers fail to build.
  worker: { format: 'es' },
});
