import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Defaults to a locally running orchestrator. Point the dev server at another
// environment with e.g.
//   API_PROXY_TARGET=https://devops.mattdev0.tech npm run dev
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:8080'
// Optional: route /api/spotify straight at a locally running spotify-service,
// bypassing the orchestrator. Only used when SPOTIFY_PROXY_TARGET is set.
const spotifyProxyTarget = process.env.SPOTIFY_PROXY_TARGET
const spotifyServiceKey = process.env.SPOTIFY_SERVICE_KEY || ''

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      ...(spotifyProxyTarget
        ? {
            '/api/spotify': {
              target: spotifyProxyTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api\/spotify/, ''),
              headers: { 'X-Service-Key': spotifyServiceKey },
            },
          }
        : {}),
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: true,
        // The orchestrator's CORS allowlist contains the deployed origin and
        // the compose frontend, not the Vite dev origin. This proxy is
        // server-side - the browser never makes a cross-origin request - so
        // present the target's own origin and let CORS pass.
        headers: {
          Origin: apiProxyTarget,
        },
      }
    }
  }
})
