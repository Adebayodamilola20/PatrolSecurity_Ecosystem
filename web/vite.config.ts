import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // No dev proxy. It used to forward /api to a local Node+SQLite server that
  // Convex replaced; that server is gone, but the proxy outlived it and quietly
  // served months-old data to anyone whose .env.local was missing — which reads
  // as "prod is wrong" rather than "I am pointed at the wrong backend".
  // Set VITE_API_URL instead; without it the app now fails visibly.
  server: {
    host: '0.0.0.0',
  },
})
