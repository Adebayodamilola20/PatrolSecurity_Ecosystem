function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required but not configured`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue = ""): string {
  return process.env[name]?.trim() || defaultValue;
}

export function getResendApiKey() {
  return requireEnv("RESEND_API_KEY");
}

export function getResendFromEmail() {
  return requireEnv("RESEND_FROM_EMAIL");
}

export function getTermiiApiKey() {
  return requireEnv("TERMII_API_KEY");
}

export function getTermiiSenderId() {
  return requireEnv("TERMII_SENDER_ID");
}

export function getTermiiBaseUrl() {
  return optionalEnv("TERMII_BASE_URL", "https://api.ng.termii.com/api");
}

export function getJwtSecret() {
  return requireEnv("PATROL_JWT_SECRET");
}

export function getConvexUrl() {
  return requireEnv("CONVEX_URL");
}

export function validateEnv() {
  getResendApiKey();
  getResendFromEmail();
  getTermiiApiKey();
  getTermiiSenderId();
  getJwtSecret();
  getConvexUrl();
}

export const DEPLOYMENT = {
  isDevelopment: process.env.CONVEX_DEPLOYMENT === "dev",
  isProduction: process.env.CONVEX_DEPLOYMENT === "production",
  isPreview: process.env.CONVEX_DEPLOYMENT === "preview",
};
