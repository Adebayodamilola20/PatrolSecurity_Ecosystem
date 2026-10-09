import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Uploading source maps needs a write-scoped Sentry token, which only CI has.
// Local and preview builds skip it rather than failing on a missing secret.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const sentryOrg = process.env.SENTRY_ORG
const sentryProject = process.env.SENTRY_PROJECT

// Client portal runs on its own port (5174) so it can be served from a
// different host/domain than the internal staff dashboard (web/, port 5173).
export default defineConfig({
  // Sentry needs source maps to turn a minified frame into a real file and
  // line. They are uploaded and then deleted, so nothing ships to the browser.
  build: { sourcemap: sentryAuthToken ? true : false },
  plugins: [
    tailwindcss(),
    react(),
    ...(sentryAuthToken && sentryOrg && sentryProject
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: sentryOrg,
            project: sentryProject,
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          }),
        ]
      : []),
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
})
