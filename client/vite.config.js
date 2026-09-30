import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3002,
    // ../shared holds pure JS used by both the server and the client (booth auto-merge geometry)
    fs: { allow: ['..'] },
  },
})
