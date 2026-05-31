import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function csvList(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

type CreatedMissedPatrolAlert = {
  id: Id<"missedPatrolAlerts">;
  checkpointName: string;
  siteName: string;
  lastScanAt: string | null;
  dueAt: string;
  expectedIntervalMinutes: number;
  gracePeriodMinutes: number;
};

export const checkAndNotify = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    checkedAt: string;
    overdueCount: number;
    createdCount: number;
    overdue: Array<Record<string, unknown>>;
    created: Array<Record<string, unknown>>;
    notificationRecipients: { email: number; phone: number };
    deliveries: Array<{ alertId: string; status: string }>;
  }> => {
    const result = await ctx.runMutation(internal.missedPatrols.checkNow, {});
    const created = (result.created ?? []) as CreatedMissedPatrolAlert[];

    const emailRecipients = csvList(
      (await ctx.runQuery(internal.settings.getLatest, {
        settingKey: "missed_patrol_email_recipients",
      })) as string | null,
    );
    const phoneRecipients = csvList(
      (await ctx.runQuery(internal.settings.getLatest, {
        settingKey: "missed_patrol_phone_recipients",
      })) as string | null,
    );

    const deliveries = [];
    for (const alert of created) {
      const delivery = await ctx.runAction(internal.notifications.sendMissedPatrolAlert, {
        alertId: alert.id,
        checkpointName: alert.checkpointName,
        siteName: alert.siteName,
        lastScanAt: alert.lastScanAt,
        dueAt: alert.dueAt,
        detectedAt: result.checkedAt,
        expectedIntervalMinutes: alert.expectedIntervalMinutes,
        gracePeriodMinutes: alert.gracePeriodMinutes,
        emailRecipients,
        phoneRecipients,
      });

      await ctx.runMutation(internal.missedPatrols.markNotificationResult, {
        alertId: alert.id,
        notificationStatus: delivery.status,
        deliveryPayload: delivery,
      });
      deliveries.push({ alertId: alert.id, status: delivery.status });
    }

    return {
      ...result,
      notificationRecipients: {
        email: emailRecipients.length,
        phone: phoneRecipients.length,
      },
      deliveries,
    };
  },
});
