import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Defaults to a locally running orchestrator. Point the dev server at another
// environment with e.g.
//   API_PROXY_TARGET=https://devops.mattdev0.tech npm run dev
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:8080'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
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
