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
