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
 * The Google calls are made by the backend (/places/*), which holds its own
 * key. They used to be made from here with the map key, which ships in the
 * public bundle and so could be lifted and billed against from anywhere.
 *
 * Nominatim stays as a fallback for when the backend has no key configured, so
 * the picker still searches instead of silently failing.
 */

import { api } from './api'

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

  try {
    const result = await api.places.autocomplete(trimmed)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (result.configured) return result.suggestions as PlaceSuggestion[]
  } catch (error) {
    // A refused key or an upstream outage shouldn't leave the picker dead —
    // fall through to the free geocoder rather than blocking the whole form.
    if ((error as Error)?.name === 'AbortError') throw error
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

  if (!suggestion.placeId) {
    throw new Error('Could not pinpoint that address. Try another suggestion.')
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const place = await api.places.details(suggestion.placeId)
  return {
    latitude: place.latitude,
    longitude: place.longitude,
    address: place.address || suggestion.description,
  }
}
