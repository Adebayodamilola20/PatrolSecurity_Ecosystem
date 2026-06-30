import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Client portal runs on its own port (5174) so it can be served from a
// different host/domain than the internal staff dashboard (web/, port 5173).
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
})
