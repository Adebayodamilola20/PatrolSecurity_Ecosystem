import * as Sentry from '@sentry/react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initTheme } from './hooks/useTheme'

// Without a DSN the SDK still installs its global handlers and queues events
// that go nowhere, so stay off entirely rather than pretending to report.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    // Preview and production deploy the same bundle, so without this every
    // environment lands in one bucket and prod alerts drown in preview noise.
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    integrations: [
      Sentry.browserTracingIntegration(),
      // This dashboard renders guard names, site addresses, live GPS and
      // incident photos. Replay records the DOM, so it is masked at the
      // source: we keep the click and navigation flow needed to reproduce a
      // bug, and none of the client data behind it.
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    // 100% tracing burns the 5k/month quota in days for no extra insight.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Tokens ride in query strings on a few endpoints (signed photo URLs),
      // and a URL is attached to almost every event.
      const scrub = (url?: string) =>
        url?.replace(/([?&](token|access_token|refresh|key|sig)=)[^&]*/gi, '$1[redacted]')
      if (event.request?.url) event.request.url = scrub(event.request.url)!
      for (const crumb of event.breadcrumbs ?? []) {
        if (typeof crumb.data?.url === 'string') crumb.data.url = scrub(crumb.data.url)
      }
      return event
    },
  })
}

initTheme()

createRoot(document.getElementById('root')!).render(<App />)
