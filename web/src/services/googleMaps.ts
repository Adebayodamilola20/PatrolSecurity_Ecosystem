declare global {
  interface Window {
    google?: any
  }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

let loaderPromise: Promise<any> | null = null

export function getGoogleMapsApiKey() {
  return GOOGLE_MAPS_API_KEY
}

export function loadGoogleMaps() {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(
      new Error('Google Maps API key is missing. Set VITE_GOOGLE_MAPS_API_KEY.'),
    )
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps)
  }

  if (loaderPromise) return loaderPromise

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-google-maps-loader="true"]',
    ) as HTMLScriptElement | null

    if (existing) {
      existing.addEventListener('load', () => resolve(window.google?.maps))
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Google Maps script.')),
      )
      return
    }

    const script = document.createElement('script')
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`
    script.async = true
    script.defer = true
    script.dataset.googleMapsLoader = 'true'
    script.onload = () => resolve(window.google?.maps)
    script.onerror = () =>
      reject(new Error('Failed to load Google Maps script.'))
    document.head.appendChild(script)
  })

  return loaderPromise
}
