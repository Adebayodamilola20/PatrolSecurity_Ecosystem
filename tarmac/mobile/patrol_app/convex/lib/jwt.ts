import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret as getJwtSecretString } from "../env";

const encoder = new TextEncoder();

function getJwtSecret() {
  return encoder.encode(getJwtSecretString());
}

/**
 * Marks a token as a session credential rather than a file capability.
 *
 * Photo and export URLs are signed with the same secret and already declare
 * `aud: patrol:photo`. This side declared nothing and checked nothing, so the
 * separation only ran one way: a photo token presented as a Bearer token passed
 * signature verification here. It failed afterwards for an incidental reason —
 * the claims carry no `userId`, so the profile lookup came back empty — which
 * means the only thing standing between a file URL and a session was a field
 * that happens to be absent. Adding a claim to photoRefs.ts would have turned
 * that into privilege escalation.
 */
const SESSION_AUDIENCE = "patrol:session";

export async function signPatrolToken(payload: {
  userId: string;
  email: string;
  role: string;
}) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    // Short-lived by design: sessions stay alive via rotating refresh tokens
    // (see convex/sessions.ts), which the server can revoke. The access token
    // itself is stateless, so its lifetime is the revocation blast radius.
    .setExpirationTime("30m")
    .sign(getJwtSecret());
}

export async function verifyPatrolToken(token: string) {
  const result = await jwtVerify(token, getJwtSecret());
  const payload = result.payload;

  // Reject a token minted for a different audience; accept one carrying no
  // audience at all.
  //
  // The permissive half is deliberate and temporary. Access tokens issued
  // before this change have no `aud`, and rejecting them would sign out every
  // guard mid-shift on deploy. Tokens for *another* audience — which is the
  // actual attack — are refused either way, so the hole is shut now and the
  // transition costs nobody a session. Once every token in circulation has been
  // through a 30-minute expiry, this can require the claim outright.
  if (payload.aud !== undefined && payload.aud !== SESSION_AUDIENCE) {
    throw new Error("Token is not a session token");
  }

  return payload as unknown as {
    userId: string;
    email: string;
    role: string;
  };
}
