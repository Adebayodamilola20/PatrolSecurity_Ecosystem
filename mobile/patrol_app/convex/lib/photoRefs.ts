import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret as getJwtSecretString, getPhotoUrlTtlSeconds } from "../env";
import type { Id } from "../_generated/dataModel";

const encoder = new TextEncoder();

// File tokens are a distinct audience from session tokens deliberately: an
// access token must never be usable as a file capability, and a leaked file URL
// must never be replayable against the rest of the API.
const PHOTO_AUDIENCE = "patrol:photo";

function secret() {
  return encoder.encode(getJwtSecretString());
}

export interface PhotoTokenClaims {
  /** storageId the bearer is allowed to read. */
  sid: string;
  /** Tenant the URL was minted for; re-checked at serve time. */
  cid?: string | null;
  /**
   * Viewer the URL was minted for. Needed because most guards have no clientId
   * of their own — without this, a guard could not be told apart from another
   * tenant when viewing a photo they took themselves.
   */
  uid?: string | null;
  role: string;
}

/**
 * Mints a short-lived capability URL for one blob.
 *
 * This is the S3 presigned-GET model. It exists because an `<img>` tag cannot
 * send an Authorization header, so the capability has to travel in the URL. The
 * token is signed (unforgeable), scoped to a single storageId (not a bearer
 * pass to all photos), and expires — unlike ctx.storage.getUrl(), which returns
 * a URL that is public and valid forever.
 *
 * Only ever call this from a handler that has already authorized the viewer for
 * the record owning this photo.
 */
export async function signPhotoToken(claims: PhotoTokenClaims): Promise<string> {
  return await new SignJWT({
    cid: claims.cid ?? null,
    uid: claims.uid ?? null,
    role: claims.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sid)
    .setAudience(PHOTO_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${getPhotoUrlTtlSeconds()}s`)
    .sign(secret());
}

export async function verifyPhotoToken(
  token: string,
): Promise<PhotoTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      audience: PHOTO_AUDIENCE,
    });
    if (!payload.sub) return null;
    return {
      sid: payload.sub,
      cid: (payload.cid as string | null) ?? null,
      uid: (payload.uid as string | null) ?? null,
      role: (payload.role as string) ?? "guard",
    };
  } catch {
    // Expired, wrong audience, tampered signature — all indistinguishable to
    // the caller on purpose.
    return null;
  }
}

/**
 * True when a stored ref is a pre-migration permanent URL rather than a
 * storageId. Kept in one place so every read path agrees on the test.
 */
export function isLegacyUrlRef(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

/**
 * Extracts the storageId embedded in a legacy Convex storage URL, e.g.
 * https://x.convex.cloud/api/storage/<storageId>. Returns null when the URL is
 * not one we recognise (an externally hosted image, say), which the migration
 * treats as "leave alone" rather than "corrupt".
 */
export function storageIdFromLegacyUrl(url: string): string | null {
  const match = url.match(/\/api\/storage\/([^/?#]+)/);
  return match?.[1] ?? null;
}

/**
 * Resolves a stored photo ref into something a client can actually load.
 *
 * - storageId  -> short-lived signed URL through our authenticated proxy
 * - legacy URL -> returned unchanged so unmigrated rows keep working
 * - empty      -> null, so callers can render "no photo" without special cases
 */
export interface PhotoViewer {
  clientId?: string | null;
  userId?: string | null;
  role: string;
}

export async function resolvePhotoRef(
  ref: string | null | undefined,
  viewer: PhotoViewer,
  // Must include the router's httpPrefix — see env.getApiBaseUrl(). A bare
  // CONVEX_SITE_URL produces a URL that 404s.
  apiBaseUrl: string,
): Promise<string | null> {
  if (!ref) return null;
  if (isLegacyUrlRef(ref)) return ref;
  const token = await signPhotoToken({
    sid: ref,
    cid: viewer.clientId ?? null,
    uid: viewer.userId ?? null,
    role: viewer.role,
  });
  return `${apiBaseUrl}/photos/${ref}?token=${encodeURIComponent(token)}`;
}

/** resolvePhotoRef over an array, dropping anything unresolvable. */
export async function resolvePhotoRefs(
  refs: readonly string[] | null | undefined,
  viewer: PhotoViewer,
  apiBaseUrl: string,
): Promise<string[]> {
  if (!refs?.length) return [];
  const resolved = await Promise.all(
    refs.map((ref) => resolvePhotoRef(ref, viewer, apiBaseUrl)),
  );
  return resolved.filter((url): url is string => !!url);
}

export type StorageId = Id<"_storage">;

/**
 * Signed URL for a non-image export (CSV/XLSX) held in the same storage.
 *
 * Exports carry patrol scan data for a whole client, so the permanent public
 * URL these records used to hold was the same defect as the photo one: anyone
 * who ever saw the link kept a working download, with no login, forever.
 */
export async function resolveFileRef(
  ref: string | null | undefined,
  viewer: PhotoViewer,
  apiBaseUrl: string,
): Promise<string | null> {
  if (!ref) return null;
  if (isLegacyUrlRef(ref)) return ref;
  const token = await signPhotoToken({
    sid: ref,
    cid: viewer.clientId ?? null,
    uid: viewer.userId ?? null,
    role: viewer.role,
  });
  return `${apiBaseUrl}/files/${ref}?token=${encodeURIComponent(token)}`;
}
