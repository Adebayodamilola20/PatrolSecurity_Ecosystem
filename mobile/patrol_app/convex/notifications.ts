"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

type DeliveryResult = {
  provider: "resend" | "termii";
  recipient: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  responseBody?: unknown;
};

const recentlySent = new Set<string>();

function makeDedupKey(eventId: string, channel: "email" | "sms", recipient: string): string {
  return `${eventId}:${channel}:${recipient}`;
}

function markSent(key: string) {
  recentlySent.add(key);
  setTimeout(() => recentlySent.delete(key), 30_000);
}

function isRecentlySent(key: string): boolean {
  return recentlySent.has(key);
}

import {
  getResendApiKey,
  getResendFromEmail,
  getTermiiApiKey,
  getTermiiSenderId,
  getTermiiBaseUrl,
} from "./env";

async function sendEmail({
  recipient,
  subject,
  html,
  text,
}: {
  recipient: string;
  subject: string;
  html: string;
  text: string;
}): Promise<DeliveryResult> {
  const apiKey = getResendApiKey();
  const from = getResendFromEmail();

  async function attempt(): Promise<DeliveryResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        html,
        text,
      }),
    });
    const body = await response.json().catch(() => null);
    return {
      provider: "resend",
      recipient,
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `Resend request failed with ${response.status}`,
      responseBody: body,
    };
  }

  let result = await attempt();
  console.log("[EMAIL_DELIVERY]", JSON.stringify(result));

  if (!result.success) {
    console.log("[EMAIL_RETRY]", JSON.stringify({ recipient, subject, attempt: 1 }));
    await new Promise((r) => setTimeout(r, 1000));
    result = await attempt();
    console.log("[EMAIL_RETRY_RESULT]", JSON.stringify(result));
  }

  return result;
}

async function sendSms({
  recipient,
  message,
}: {
  recipient: string;
  message: string;
}): Promise<DeliveryResult> {
  const apiKey = getTermiiApiKey();
  const senderId = getTermiiSenderId();
  const baseUrl = getTermiiBaseUrl();
  const response = await fetch(`${baseUrl}/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      to: recipient,
      from: senderId,
      sms: message,
      type: "plain",
      channel: "generic",
    }),
  });
  const body = await response.json().catch(() => null);
  const result: DeliveryResult = {
    provider: "termii",
    recipient,
    success: response.ok,
    statusCode: response.status,
    error: response.ok ? undefined : `Termii request failed with ${response.status}`,
    responseBody: body,
  };
  console.log("[SMS_DELIVERY]", JSON.stringify(result));
  return result;
}

export const sendEmergencyAlert = internalAction({
  args: {
    eventId: v.id("emergencyEvents"),
    officerName: v.string(),
    officerEmail: v.string(),
    siteLabel: v.string(),
    location: v.string(),
    note: v.string(),
    triggeredAt: v.string(),
    emailRecipients: v.array(v.string()),
    phoneRecipients: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const subject = `Emergency alert: ${args.officerName} at ${args.siteLabel || "Unknown site"}`;
    const textLines = [
      "Emergency alert triggered.",
      `Officer: ${args.officerName}`,
      `Officer email: ${args.officerEmail || "Unknown"}`,
      `Site: ${args.siteLabel || "Unknown site"}`,
      `Location: ${args.location || "Unknown location"}`,
      `Triggered at: ${args.triggeredAt}`,
      `Note: ${args.note || "No note provided"}`,
      `Event ID: ${args.eventId}`,
    ];
    const text = textLines.join("\n");
    const html = `
      <div>
        <h2>Emergency alert triggered</h2>
        <p><strong>Officer:</strong> ${args.officerName}</p>
        <p><strong>Officer email:</strong> ${args.officerEmail || "Unknown"}</p>
        <p><strong>Site:</strong> ${args.siteLabel || "Unknown site"}</p>
        <p><strong>Location:</strong> ${args.location || "Unknown location"}</p>
        <p><strong>Triggered at:</strong> ${args.triggeredAt}</p>
        <p><strong>Note:</strong> ${args.note || "No note provided"}</p>
        <p><strong>Event ID:</strong> ${args.eventId}</p>
      </div>
    `;

    const emailTasks = args.emailRecipients
      .filter((recipient) => {
        const key = makeDedupKey(args.eventId, "email", recipient);
        if (isRecentlySent(key)) {
          console.log("[DEDUP_SKIP]", JSON.stringify({ eventId: args.eventId, recipient, channel: "email" }));
          return false;
        }
        markSent(key);
        return true;
      })
      .map((recipient) =>
        sendEmail({
          recipient,
          subject,
          html,
          text,
        }),
      );
    const smsTasks = args.phoneRecipients
      .filter((recipient) => {
        const key = makeDedupKey(args.eventId, "sms", recipient);
        if (isRecentlySent(key)) {
          console.log("[DEDUP_SKIP]", JSON.stringify({ eventId: args.eventId, recipient, channel: "sms" }));
          return false;
        }
        markSent(key);
        return true;
      })
      .map((recipient) =>
        sendSms({
          recipient,
          message: text,
        }),
      );

    const deliveries = await Promise.all(
      [...emailTasks, ...smsTasks].map((task, index) =>
        task.catch((error) => {
          const emailCount = args.emailRecipients.length;
          const recipient =
            index < emailCount
              ? args.emailRecipients[index]
              : args.phoneRecipients[index - emailCount];
          return {
            provider: index < emailCount ? "resend" : "termii",
            recipient,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies DeliveryResult;
        }),
      ),
    );

    const succeeded = deliveries.filter((item) => item.success);
    const failed = deliveries.filter((item) => !item.success);

    console.log("[EMERGENCY_ALERT_SUMMARY]", JSON.stringify({
      eventId: args.eventId,
      attempted: deliveries.length,
      delivered: succeeded.length,
      failed: failed.length,
    }));

    return {
      status:
        deliveries.length === 0
          ? "no_recipients_configured"
          : failed.length === 0
            ? "delivered"
            : succeeded.length === 0
              ? "failed"
              : "partial_failure",
      deliveries,
      summary: {
        attempted: deliveries.length,
        delivered: succeeded.length,
        failed: failed.length,
      },
    };
  },
});

export const sendMissedPatrolAlert = internalAction({
  args: {
    alertId: v.id("missedPatrolAlerts"),
    checkpointName: v.string(),
    siteName: v.string(),
    lastScanAt: v.union(v.string(), v.null()),
    dueAt: v.string(),
    detectedAt: v.string(),
    expectedIntervalMinutes: v.number(),
    gracePeriodMinutes: v.number(),
    emailRecipients: v.array(v.string()),
    phoneRecipients: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const subject = `Missed patrol alert: ${args.checkpointName}`;
    const textLines = [
      "Missed patrol alert.",
      `Checkpoint: ${args.checkpointName}`,
      `Site: ${args.siteName || "Unknown site"}`,
      `Last scan: ${args.lastScanAt || "No previous scan"}`,
      `Due at: ${args.dueAt}`,
      `Detected at: ${args.detectedAt}`,
      `Expected interval: ${args.expectedIntervalMinutes} minutes`,
      `Grace period: ${args.gracePeriodMinutes} minutes`,
      `Alert ID: ${args.alertId}`,
    ];
    const text = textLines.join("\n");
    const html = `
      <div>
        <h2>Missed patrol alert</h2>
        <p><strong>Checkpoint:</strong> ${args.checkpointName}</p>
        <p><strong>Site:</strong> ${args.siteName || "Unknown site"}</p>
        <p><strong>Last scan:</strong> ${args.lastScanAt || "No previous scan"}</p>
        <p><strong>Due at:</strong> ${args.dueAt}</p>
        <p><strong>Detected at:</strong> ${args.detectedAt}</p>
        <p><strong>Expected interval:</strong> ${args.expectedIntervalMinutes} minutes</p>
        <p><strong>Grace period:</strong> ${args.gracePeriodMinutes} minutes</p>
        <p><strong>Alert ID:</strong> ${args.alertId}</p>
      </div>
    `;

    const emailTasks = args.emailRecipients
      .filter((recipient) => {
        const key = makeDedupKey(args.alertId, "email", recipient);
        if (isRecentlySent(key)) {
          console.log("[DEDUP_SKIP]", JSON.stringify({ alertId: args.alertId, recipient, channel: "email" }));
          return false;
        }
        markSent(key);
        return true;
      })
      .map((recipient) =>
        sendEmail({ recipient, subject, html, text }),
      );
    const smsTasks = args.phoneRecipients
      .filter((recipient) => {
        const key = makeDedupKey(args.alertId, "sms", recipient);
        if (isRecentlySent(key)) {
          console.log("[DEDUP_SKIP]", JSON.stringify({ alertId: args.alertId, recipient, channel: "sms" }));
          return false;
        }
        markSent(key);
        return true;
      })
      .map((recipient) =>
        sendSms({ recipient, message: text }),
      );

    const deliveries = await Promise.all(
      [...emailTasks, ...smsTasks].map((task, index) =>
        task.catch((error) => {
          const emailCount = args.emailRecipients.length;
          const recipient =
            index < emailCount
              ? args.emailRecipients[index]
              : args.phoneRecipients[index - emailCount];
          return {
            provider: index < emailCount ? "resend" : "termii",
            recipient,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies DeliveryResult;
        }),
      ),
    );

    const succeeded = deliveries.filter((item) => item.success);
    const failed = deliveries.filter((item) => !item.success);

    console.log("[MISSED_PATROL_ALERT_SUMMARY]", JSON.stringify({
      alertId: args.alertId,
      attempted: deliveries.length,
      delivered: succeeded.length,
      failed: failed.length,
    }));

    return {
      status:
        deliveries.length === 0
          ? "no_recipients_configured"
          : failed.length === 0
            ? "delivered"
            : succeeded.length === 0
              ? "failed"
              : "partial_failure",
      deliveries,
      summary: {
        attempted: deliveries.length,
        delivered: succeeded.length,
        failed: failed.length,
      },
    };
  },
});
