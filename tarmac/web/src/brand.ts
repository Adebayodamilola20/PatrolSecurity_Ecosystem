/**
 * Which company this build is for. One codebase serves several security
 * companies; each Vercel project sets VITE_BRAND. Default is Evergreen so
 * existing deployments are unchanged.
 */
export type BrandId = 'evergreen' | 'tarmac'

export const BRAND_ID: BrandId = import.meta.env.VITE_BRAND === 'tarmac' ? 'tarmac' : 'evergreen'
export const isTarmac = BRAND_ID === 'tarmac'

export const brand = {
  evergreen: {
    name: 'Evergreen',
    company: 'Evergreen Security',
    appName: 'Evergreen app',
    logo: null as string | null,
    website: null as string | null,
  },
  tarmac: {
    name: 'Tarmac Security',
    company: 'Tarmac Security Ltd.',
    appName: 'Tarmac Security app',
    logo: '/brand/tarmac-crest.png' as string | null,
    website: 'https://tarmacsecurity.ng' as string | null,
  },
}[BRAND_ID]

/** Tag <html> so brand CSS applies, and swap title, favicon and fonts. */
export function applyBrand(surfaceTitle: string) {
  document.documentElement.dataset.brand = BRAND_ID
  if (!isTarmac) return
  document.title = `${brand.name} · ${surfaceTitle}`
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) {
    icon.type = 'image/png'
    icon.href = '/brand/tarmac-crest-192.png'
  }
  const font = document.createElement('link')
  font.rel = 'stylesheet'
  font.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap'
  document.head.appendChild(font)
}

/** Features a company has switched off. Tarmac does not use shift handovers. */
export const features = {
  handovers: !isTarmac,
  // Admin-uploaded personnel pictures (needs the Tarmac backend's "profile" photo kind).
  profilePhotos: isTarmac,
  // "Not scanned by start time" alerts (needs LATE_SCAN_ALERTS=on on the backend).
  lateScanAlerts: isTarmac,
  // Finance package pages (payments, partners, payroll…), Tarmac only.
  finance: isTarmac,
}
