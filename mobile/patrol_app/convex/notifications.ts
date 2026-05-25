"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

type DeliveryResult = {
  provider: "resend" | "termii";
  recipient: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  responseBody?: unknown;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

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
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("RESEND_FROM_EMAIL");
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

async function sendSms({
  recipient,
  message,
}: {
  recipient: string;
  message: string;
}): Promise<DeliveryResult> {
  const apiKey = requireEnv("TERMII_API_KEY");
  const senderId = requireEnv("TERMII_SENDER_ID");
  const baseUrl = process.env.TERMII_BASE_URL?.trim() || "https://api.ng.termii.com/api";
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
  return {
    provider: "termii",
    recipient,
    success: response.ok,
    statusCode: response.status,
    error: response.ok ? undefined : `Termii request failed with ${response.status}`,
    responseBody: body,
  };
}

export const sendEmergencyAlert = action({
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

    const emailTasks = args.emailRecipients.map((recipient) =>
      sendEmail({
        recipient,
        subject,
        html,
        text,
      }),
    );
    const smsTasks = args.phoneRecipients.map((recipient) =>
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
