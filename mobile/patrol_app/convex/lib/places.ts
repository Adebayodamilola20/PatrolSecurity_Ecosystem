/*
 * Google Places lookups for the dashboard's address pickers, made from here so
 * the key never reaches a browser.
 *
 * The dashboard used to call Places directly with the same key it loads the
 * map with. That key ships in the public JS bundle, and a referrer restriction
 * does not protect a REST API: anyone can send whatever Referer they like from
 * a script. Holding a separate key server-side, behind a staff login and a rate
 * limit, means the browser key can be restricted to the Maps JavaScript API
 * alone and a copied key buys an attacker nothing billable here.
 *
 * Returns null when no key is configured, so the dashboard can fall back to the
 * free geocoder instead of leaving the picker dead.
 */

export type PlaceSuggestion = {
  id: string;
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
  latitude: string;
  longitude: string;
};

function placesKey(): string | null {
  const key = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  return key ? key : null;
}

export function hasPlacesKey(): boolean {
  return placesKey() !== null;
}

// A Places id is an opaque token of URL-safe characters. Validated before it is
// put into an upstream URL so a caller cannot steer the request elsewhere.
const PLACE_ID_SHAPE = /^[A-Za-z0-9_-]{1,512}$/;

export function isPlaceId(value: string): boolean {
  return PLACE_ID_SHAPE.test(value);
}

export async function autocompletePlaces(query: string): Promise<PlaceSuggestion[] | null> {
  const key = placesKey();
  if (!key) return null;

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["ng"],
      languageCode: "en",
    }),
  });
  if (!response.ok) {
    throw new Error(`Places autocomplete failed with ${response.status}`);
  }

  const data: any = await response.json();
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  return suggestions
    .map((entry: any) => entry?.placePrediction)
    .filter((prediction: any) => typeof prediction?.placeId === "string")
    .map((prediction: any) => {
      const structured = prediction.structuredFormat ?? {};
      const main = String(structured.mainText?.text ?? "").trim();
      const secondary = String(structured.secondaryText?.text ?? "").trim();
      const full = String(prediction.text?.text ?? "").trim();
      return {
        id: prediction.placeId,
        placeId: prediction.placeId,
        mainText: main || full || "Selected address",
        secondaryText: secondary,
        description: full || [main, secondary].filter(Boolean).join(", "),
        latitude: "",
        longitude: "",
      };
    });
}

export async function placeLocation(
  placeId: string,
): Promise<{ latitude: string; longitude: string; address: string } | null> {
  const key = placesKey();
  if (!key) return null;

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "location,formattedAddress",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Places details failed with ${response.status}`);
  }

  const data: any = await response.json();
  const latitude = data?.location?.latitude;
  const longitude = data?.location?.longitude;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new Error("Places details returned no location");
  }
  return {
    latitude: String(latitude),
    longitude: String(longitude),
    address: String(data?.formattedAddress ?? ""),
  };
}
