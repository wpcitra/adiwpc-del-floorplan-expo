import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Uploaded images are stored with a relative URL (/api/uploads/<hash>.png, AGENTS.md §28). In development the page
// (3002) and the API (5001) are different origins, so those URLs are proxied to the API.
const apiOrigin = (() => { try { return new URL(process.env.VITE_API_URL || 'http://localhost:5001/api').origin; } catch (e) { return 'http://localhost:5001'; } })();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3002,
    proxy: { '/api/uploads': { target: apiOrigin, changeOrigin: true } },
    // ../shared holds pure JS used by both the server and the client (booth auto-merge geometry)
    fs: { allow: ['..'] },
  },
})
