import { query } from "./_generated/server";

export const status = query({
  args: {},
  handler: async () => {
    return {
      status: "ok",
      timestamp: Date.now(),
      service: "convex",
    };
  },
});
