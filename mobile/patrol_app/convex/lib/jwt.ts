import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();

function getJwtSecret() {
  const secret = process.env.PATROL_JWT_SECRET;
  if (!secret) {
    throw new Error("PATROL_JWT_SECRET is not configured");
  }
  return encoder.encode(secret);
}

export async function signPatrolToken(payload: {
  userId: string;
  email: string;
  role: string;
}) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
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
