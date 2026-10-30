# Wasm Media Tool

Client-side trim / compress / convert with React + Vite + Tailwind v4 + FFmpeg.wasm 0.12. No backend.

## Setup
    npm install
    npm run dev        # http://localhost:5173 (COOP/COEP headers on)
    npm run build && npm run preview

Check isolation in DevTools console: `crossOriginIsolated` should be `true`.
If it is false, the app still works on the single-threaded core (slower).

## Deploy headers (required for multi-threaded core)
- Netlify / Cloudflare Pages: `public/_headers` (included)
- Vercel: `vercel.json` (included)
- Nginx:
    add_header Cross-Origin-Opener-Policy same-origin;
    add_header Cross-Origin-Embedder-Policy require-corp;

With COEP require-corp, every cross-origin resource (images, fonts, scripts) needs CORS
or a `Cross-Origin-Resource-Policy` header. unpkg sends CORS, so the FFmpeg core loads fine.
To self-host the core, copy `node_modules/@ffmpeg/core-mt/dist/esm/*` to `public/ffmpeg/`
and point MT_BASE in `src/hooks/useFFmpeg.js` at `/ffmpeg`.

## Structure
    vite.config.js                 headers, optimizeDeps exclude, ES workers
    src/hooks/useFFmpeg.js         load / run / probe / cancel, progress + errors, MEMFS cleanup
    src/lib/commands.js            UI choices -> FFmpeg args (trim, compress presets, mp4, mp3)
    src/lib/time.js                hh:mm:ss parse/format, bytes
    src/components/                Uploader, VideoPreview, TrimmerControls, OperationSelector,
                                   ProgressBar, DownloadCard, ThemeToggle
