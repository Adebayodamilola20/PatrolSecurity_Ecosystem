// Report template registry — the single source of truth for what each report
// category looks like. The staff web app renders these fields as the report
// form (it keeps a mirror in web/src/lib/reportTemplates.ts — keep in sync),
// and the server validates every submission against this registry so a
// hand-crafted request can't invent categories or fields.

export type TemplateFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "time"
  | "select";

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  required?: boolean;
  options?: string[]; // for type "select"
  placeholder?: string;
}

export interface ReportTemplate {
  category: string;
  label: string;
  description: string;
  fields: TemplateField[];
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    category: "clock-in",
    label: "Clock-In Report",
    description: "Shift start confirmation for a location.",
    fields: [
      { key: "shiftDate", label: "Shift date", type: "date", required: true },
      { key: "clockInTime", label: "Clock-in time", type: "time", required: true },
      { key: "guardsOnDuty", label: "Guards on duty", type: "number", required: true },
      { key: "postAssignments", label: "Post assignments", type: "textarea", placeholder: "Who covers which post" },
      { key: "remarks", label: "Remarks", type: "textarea" },
    ],
  },
  {
    category: "clock-out",
    label: "Clock-Out Report",
    description: "Shift end summary and handover.",
    fields: [
      { key: "shiftDate", label: "Shift date", type: "date", required: true },
      { key: "clockOutTime", label: "Clock-out time", type: "time", required: true },
      { key: "hoursCovered", label: "Hours covered", type: "number" },
      { key: "handoverNotes", label: "Handover notes", type: "textarea", required: true },
      { key: "incidentsDuringShift", label: "Incidents during shift", type: "textarea", placeholder: "None" },
    ],
  },
  {
    category: "patrol-scan",
    label: "Patrol Scan Report",
    description: "Summary of patrol rounds and QR points covered.",
    fields: [
      { key: "patrolDate", label: "Patrol date", type: "date", required: true },
      { key: "patrolWindow", label: "Patrol window", type: "text", placeholder: "e.g. 22:00 - 06:00" },
      { key: "roundsCompleted", label: "Rounds completed", type: "number", required: true },
      { key: "pointsCovered", label: "Points covered", type: "textarea", required: true },
      { key: "missedPoints", label: "Missed points", type: "textarea", placeholder: "None" },
      { key: "observations", label: "Observations", type: "textarea" },
    ],
  },
  {
    category: "location-verification",
    label: "Location Verification Report",
    description: "GPS verification status of patrol points at a location.",
    fields: [
      { key: "verificationDate", label: "Verification date", type: "date", required: true },
      { key: "pointsVerified", label: "Points verified", type: "textarea", required: true },
      {
        key: "gpsStatus", label: "GPS status", type: "select", required: true,
        options: ["All points verified", "Partially verified", "Verification failed"],
      },
      { key: "discrepancies", label: "Discrepancies", type: "textarea", placeholder: "None" },
      { key: "correctiveAction", label: "Corrective action", type: "textarea" },
    ],
  },
  {
    category: "incident",
    label: "Incident Report",
    description: "Security incident with severity and action taken.",
    fields: [
      { key: "incidentDate", label: "Incident date", type: "date", required: true },
      { key: "incidentTime", label: "Incident time", type: "time", required: true },
      {
        key: "severity", label: "Severity", type: "select", required: true,
        options: ["Low", "Medium", "High", "Critical"],
      },
      {
        key: "incidentCategory", label: "Category", type: "select", required: true,
        options: ["Theft", "Trespass", "Vandalism", "Fire", "Medical", "Suspicious Activity", "Other"],
      },
      { key: "description", label: "What happened", type: "textarea", required: true },
      { key: "actionTaken", label: "Action taken", type: "textarea", required: true },
      { key: "authoritiesNotified", label: "Authorities notified", type: "select", options: ["No", "Yes - Police", "Yes - Fire service", "Yes - Medical"] },
      { key: "followUp", label: "Follow-up required", type: "textarea", placeholder: "None" },
    ],
  },
  {
    category: "maintenance",
    label: "Maintenance Report",
    description: "Equipment or facility issue needing attention.",
    fields: [
      { key: "reportDate", label: "Report date", type: "date", required: true },
      { key: "equipmentName", label: "Equipment / facility", type: "text", required: true },
      { key: "issueDescription", label: "Issue description", type: "textarea", required: true },
      {
        key: "urgency", label: "Urgency", type: "select", required: true,
        options: ["Routine", "Soon", "Urgent", "Safety hazard"],
      },
      { key: "recommendedAction", label: "Recommended action", type: "textarea" },
    ],
  },
  {
    category: "daily-activity",
    label: "Daily Activity Report",
    description: "Full-day activity summary for a location.",
    fields: [
      { key: "activityDate", label: "Activity date", type: "date", required: true },
      { key: "summary", label: "Summary of the day", type: "textarea", required: true },
      { key: "patrolsCompleted", label: "Patrols completed", type: "number" },
      { key: "visitorsProcessed", label: "Visitors processed", type: "number" },
      { key: "openIssues", label: "Open issues", type: "textarea", placeholder: "None" },
    ],
  },
  {
    category: "emergency",
    label: "Emergency Report",
    description: "Emergency event and the response to it.",
    fields: [
      { key: "emergencyDate", label: "Emergency date", type: "date", required: true },
      { key: "emergencyTime", label: "Emergency time", type: "time", required: true },
      {
        key: "emergencyType", label: "Emergency type", type: "select", required: true,
        options: ["Fire", "Medical", "Security breach", "Panic alarm", "Natural event", "Other"],
      },
      { key: "responseSummary", label: "Response summary", type: "textarea", required: true },
      { key: "emergencyServices", label: "Emergency services involved", type: "select", options: ["None", "Police", "Fire service", "Ambulance", "Multiple"] },
      { key: "outcome", label: "Outcome", type: "textarea", required: true },
    ],
  },
  {
    category: "visitor",
    label: "Visitor Report",
    description: "Visitor traffic summary for a location.",
    fields: [
      { key: "reportDate", label: "Report date", type: "date", required: true },
      { key: "totalVisitors", label: "Total visitors", type: "number", required: true },
      { key: "deniedEntries", label: "Denied entries", type: "number" },
      { key: "highlights", label: "Highlights", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    category: "truck",
    label: "Truck / Vehicle Report",
    description: "Truck and vehicle movement summary for a location.",
    fields: [
      { key: "reportDate", label: "Report date", type: "date", required: true },
      { key: "totalTrucks", label: "Total trucks", type: "number", required: true },
      { key: "inboundCount", label: "Inbound", type: "number" },
      { key: "outboundCount", label: "Outbound", type: "number" },
      { key: "cargoNotes", label: "Cargo notes", type: "textarea" },
      { key: "flaggedVehicles", label: "Flagged vehicles", type: "textarea", placeholder: "None" },
    ],
  },
];

export function getReportTemplate(category: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find((t) => t.category === category);
}

// Validates submitted fields against the template: unknown keys rejected,
// required fields must be present. Returns a cleaned fields object.
export function validateTemplateFields(
  template: ReportTemplate,
  fields: Record<string, unknown>,
): { ok: true; fields: Record<string, string> } | { ok: false; error: string } {
  const cleaned: Record<string, string> = {};
  const known = new Map(template.fields.map((f) => [f.key, f]));
  for (const key of Object.keys(fields ?? {})) {
    if (!known.has(key)) return { ok: false, error: `Unknown field: ${key}` };
  }
  for (const field of template.fields) {
    const raw = fields?.[field.key];
    const value = raw == null ? "" : String(raw).trim();
    if (field.required && !value) {
      return { ok: false, error: `${field.label} is required` };
    }
    if (field.type === "select" && value && field.options && !field.options.includes(value)) {
      return { ok: false, error: `${field.label}: invalid option` };
    }
    if (value) cleaned[field.key] = value;
  }
  return { ok: true, fields: cleaned };
}
