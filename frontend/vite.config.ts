import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/token-exchange/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    allowedHosts: ['mhomeserver.tail5d8a41.ts.net'],
    proxy: {
      // Proxy /api requests to the local Express backend during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  } 
})