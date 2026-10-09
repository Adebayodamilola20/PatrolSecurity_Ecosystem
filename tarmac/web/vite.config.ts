import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Uploading source maps needs a write-scoped Sentry token, which only CI has.
// Local and preview builds skip it rather than failing on a missing secret.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const sentryOrg = process.env.SENTRY_ORG
const sentryProject = process.env.SENTRY_PROJECT

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
  // No dev proxy. It used to forward /api to a local Node+SQLite server that
  // Convex replaced; that server is gone, but the proxy outlived it and quietly
  // served months-old data to anyone whose .env.local was missing — which reads
  // as "prod is wrong" rather than "I am pointed at the wrong backend".
  // Set VITE_API_URL instead; without it the app now fails visibly.
  server: {
    host: '0.0.0.0',
  },
})
