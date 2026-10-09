// Environment the backend reads at call time. A throwaway signing key: these
// tokens are minted and verified inside one test process and never leave it.
// Kept outside convex/ so the deployment bundler never sees it.
process.env.PATROL_JWT_SECRET ??= "test-only-signing-key-not-used-anywhere-else";
process.env.CONVEX_URL ??= "https://test.convex.cloud";
process.env.CONVEX_SITE_URL ??= "https://test.convex.site";
