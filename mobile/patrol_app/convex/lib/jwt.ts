import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret as getJwtSecretString } from "../env";

const encoder = new TextEncoder();

function getJwtSecret() {
  return encoder.encode(getJwtSecretString());
}

export async function signPatrolToken(payload: {
  userId: string;
  email: string;
  role: string;
}) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    // Short-lived by design: sessions stay alive via rotating refresh tokens
    // (see convex/sessions.ts), which the server can revoke. The access token
    // itself is stateless, so its lifetime is the revocation blast radius.
    .setExpirationTime("30m")
    .sign(getJwtSecret());
}

export async function verifyPatrolToken(token: string) {
  const result = await jwtVerify(token, getJwtSecret());
  return result.payload as {
    userId: string;
    email: string;
    role: string;
  };
}
