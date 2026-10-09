import { internalQuery } from "./_generated/server";

export const status = internalQuery({
  args: {},
  handler: async () => {
    return {
      status: "ok",
      timestamp: Date.now(),
      service: "convex",
    };
  },
});
