/*
 * Address lookup for the location and checkpoint pickers.
 *
 * This used to call Nominatim (OpenStreetMap) directly. OSM's Nigerian data
 * carries the street geometry but almost none of the individual house-number
 * nodes, so a real address like "2 Ajani Olujare Street, Alaka Estate, Surulere"
 * returned nothing while the bare street name matched — leaving whoever was
 * adding a site to drop the pin by eye on a street full of buildings.
 *
 * Google Places Autocomplete returns that exact address, house number and all,
 * and tolerates the spelling drift between what people write and what the map
 * records. Autocomplete carries no coordinates, so the pick is resolved through
 * Place Details; that costs one extra request per *selection* rather than per
 * keystroke, which is also the cheaper way round.
 *
 * Nominatim stays as a fallback for when no key is configured, so a checkout
 * without VITE_GOOGLE_MAPS_API_KEY still searches instead of silently failing.
 */

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export interface PlaceSuggestion {
  id: string
  mainText: string
  secondaryText: string
  description: string
  /** Empty until resolved — Autocomplete does not return coordinates. */
  latitude: string
  longitude: string
  /** Present only for Google results; absent means lat/lng are already final. */
  placeId?: string
}

export function hasPlacesKey() {
  return Boolean(GOOGLE_MAPS_API_KEY)
}

async function autocompleteWithGoogle(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const response = await fetch(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ['ng'],
        languageCode: 'en',
      }),
    },
  )

  if (!response.ok) throw new Error('Could not search for that address.')

  const data = await response.json()
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : []

  return suggestions
    .map((entry: any) => entry?.placePrediction)
    .filter((prediction: any) => prediction?.placeId)
    .map((prediction: any) => {
      const structured = prediction.structuredFormat ?? {}
      const main = String(structured.mainText?.text ?? '').trim()
      const secondary = String(structured.secondaryText?.text ?? '').trim()
      const full = String(prediction.text?.text ?? '').trim()
      return {
        id: String(prediction.placeId),
        placeId: String(prediction.placeId),
        mainText: main || full || 'Selected address',
        secondaryText: secondary,
        // The full one-line address is what gets written into the Address field.
        description: full || [main, secondary].filter(Boolean).join(', '),
        latitude: '',
        longitude: '',
      }
    })
}

async function searchWithNominatim(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ng&q=${encodeURIComponent(query)}`,
    { signal, headers: { Accept: 'application/json' } },
  )

  if (!response.ok) throw new Error('Could not search for that address.')

  const results = await response.json()

  return (Array.isArray(results) ? results : []).map((result: any) => {
    const display = String(result.display_name ?? '')
    return {
      id: String(result.place_id),
      mainText: display.split(',').slice(0, 2).join(', ') || 'Selected address',
      secondaryText: display.split(',').slice(2).join(',').trim(),
      description: display,
      latitude: String(result.lat),
      longitude: String(result.lon),
    }
  })
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  if (GOOGLE_MAPS_API_KEY) {
    try {
      return await autocompleteWithGoogle(trimmed, signal)
    } catch (error) {
      // A refused key or an unenabled API shouldn't leave the picker dead —
      // fall through to the free geocoder rather than blocking the whole form.
      if ((error as Error)?.name === 'AbortError') throw error
    }
  }

  return searchWithNominatim(trimmed, signal)
}

/**
 * Turns a picked suggestion into coordinates. Nominatim results already carry
 * them; Google ones need the details lookup. Throws rather than returning a
 * silent 0,0 — a checkpoint dropped at the origin is worse than a visible error.
 */
export async function resolvePlaceLocation(
  suggestion: PlaceSuggestion,
  signal?: AbortSignal,
): Promise<{ latitude: string; longitude: string; address: string }> {
  if (suggestion.latitude && suggestion.longitude) {
    return {
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      address: suggestion.description,
    }
  }

  if (!suggestion.placeId || !GOOGLE_MAPS_API_KEY) {
    throw new Error('Could not pinpoint that address. Try another suggestion.')
  }

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(suggestion.placeId)}`,
    {
      signal,
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'location,formattedAddress',
      },
    },
  )

  if (!response.ok) {
    throw new Error('Could not pinpoint that address. Try another suggestion.')
  }

  const data = await response.json()
  if (typeof data?.location?.latitude !== 'number') {
    throw new Error('Could not pinpoint that address. Try another suggestion.')
  }

  return {
    latitude: String(data.location.latitude),
    longitude: String(data.location.longitude),
    address: String(data.formattedAddress ?? suggestion.description),
  }
}
