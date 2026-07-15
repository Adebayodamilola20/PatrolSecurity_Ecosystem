"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { scrubOfficerName } from "./lib/anonymize";

// Renders a submitted report as a real PDF and caches it in Convex storage.
// Two variants: "staff" includes the submitting officer; "portal" omits every
// guard identity (AGM rule — clients see the work, never who did it).
export const generateReportPdf = internalAction({
  args: {
    reportId: v.id("reportSubmissions"),
    variant: v.union(v.literal("staff"), v.literal("portal")),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const report = await ctx.runQuery(internal.reports.getForPdf, {
      reportId: args.reportId,
    });
    if (!report) return null;

    const cached =
      args.variant === "staff" ? report.pdfStorageId : report.portalPdfStorageId;
    if (cached) return cached;

    const bytes = await composeReportPdf(report, args.variant);
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    );
    await ctx.runMutation(internal.reports.setPdfStorage, {
      reportId: args.reportId,
      storageId,
      variant: args.variant,
    });
    return storageId;
  },
});

type ReportData = {
  id: string;
  type: string;
  title: string;
  summary: string;
  details: unknown;
  equipmentName: string | null;
  evidenceUrls: string[];
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  siteLabel: string;
  siteName: string | null;
  checkpointName: string | null;
  clientName: string | null;
  officerName: string | null;
  status: string;
  submittedAt: number;
};

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.13, 0.35, 0.75);
const RULE = rgb(0.85, 0.87, 0.9);

async function composeReportPdf(
  report: ReportData,
  variant: "staff" | "portal",
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // The portal variant must not carry the officer's identity ANYWHERE —
  // including the title, which the app builds from the officer's name.
  const anonymize = (text: string) =>
    variant === "portal" ? scrubOfficerName(text, report.officerName) : text;
  const title = anonymize(report.title);
  const summary = anonymize(report.summary);

  doc.setTitle(`${title} - ${typeLabel(report.type)}`);
  doc.setCreator("Patrol Security Ecosystem");

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN + 24) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawWrapped = (
    text: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; lineGap?: number; indent?: number },
  ) => {
    const f = options.font ?? font;
    const size = options.size ?? 10.5;
    const gap = options.lineGap ?? 4;
    const indent = options.indent ?? 0;
    const lines = wrapText(text, f, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      newPageIfNeeded(size + gap);
      page.drawText(line, {
        x: MARGIN + indent,
        y: y - size,
        size,
        font: f,
        color: options.color ?? INK,
      });
      y -= size + gap;
    }
  };

  const sectionHeading = (label: string) => {
    newPageIfNeeded(34);
    y -= 14;
    page.drawText(label.toUpperCase(), {
      x: MARGIN,
      y: y - 9,
      size: 9,
      font: bold,
      color: ACCENT,
    });
    y -= 15;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: RULE,
    });
    y -= 10;
  };

  // --- Header ---------------------------------------------------------
  page.drawText("PATROL SECURITY", {
    x: MARGIN, y: y - 11, size: 11, font: bold, color: ACCENT,
  });
  const headerRight = `${typeLabel(report.type)} report`;
  page.drawText(headerRight, {
    x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(headerRight, 10),
    y: y - 11, size: 10, font, color: MUTED,
  });
  y -= 30;
  drawWrapped(title, { font: bold, size: 19, lineGap: 6 });
  y -= 2;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1.2,
    color: ACCENT,
  });
  y -= 6;

  // --- Meta block -------------------------------------------------------
  const meta: Array<[string, string]> = [
    ["Report ID", String(report.id)],
    ["Submitted", formatDate(report.submittedAt)],
    ["Status", capitalize(report.status)],
  ];
  if (report.clientName) meta.push(["Client", report.clientName]);
  const location = [report.siteName ?? report.siteLabel, report.checkpointName]
    .filter(Boolean)
    .join(" - ");
  if (location) meta.push(["Location", location]);
  if (variant === "staff" && report.officerName) {
    meta.push(["Submitted by", report.officerName]);
  }
  if (report.gpsLatitude != null && report.gpsLongitude != null) {
    meta.push(["GPS", `${report.gpsLatitude.toFixed(6)}, ${report.gpsLongitude.toFixed(6)}`]);
  }
  if (report.equipmentName) meta.push(["Equipment", report.equipmentName]);

  y -= 10;
  const labelWidth = 90;
  for (const [label, value] of meta) {
    newPageIfNeeded(16);
    page.drawText(label, { x: MARGIN, y: y - 9, size: 9, font: bold, color: MUTED });
    const valueLines = wrapText(value, font, 10, CONTENT_WIDTH - labelWidth);
    for (const [i, line] of valueLines.entries()) {
      if (i > 0) newPageIfNeeded(14);
      page.drawText(line, { x: MARGIN + labelWidth, y: y - 9.5, size: 10, font, color: INK });
      if (i < valueLines.length - 1) y -= 13;
    }
    y -= 16;
  }

  // --- Summary ----------------------------------------------------------
  if (summary.trim()) {
    sectionHeading("Summary");
    drawWrapped(summary.trim(), { size: 10.5 });
  }

  // --- Details ------------------------------------------------------------
  const detailEntries = flattenDetails(report.details).map(
    ([key, value]) => [key, anonymize(value)] as [string, string],
  );
  if (detailEntries.length > 0) {
    sectionHeading("Report details");
    for (const [key, value] of detailEntries) {
      newPageIfNeeded(30);
      drawWrapped(humanizeKey(key), { font: bold, size: 9.5, color: MUTED, lineGap: 3 });
      drawWrapped(value, { size: 10.5, lineGap: 5, indent: 0 });
      y -= 3;
    }
  }

  // --- Evidence --------------------------------------------------------
  // Deliberately NOT a link. Photo access is authorized per viewer and the
  // signed URLs are short-lived, so a URL printed here would either be dead by
  // the time anyone read it or — as it used to be — a permanent public link to
  // evidence, baked into a document that gets emailed around.
  if (report.evidenceUrls.length > 0) {
    sectionHeading("Evidence");
    drawWrapped(
      `${report.evidenceUrls.length} photo${report.evidenceUrls.length === 1 ? "" : "s"} attached — view in the dashboard under this report.`,
      { size: 9, color: MUTED, lineGap: 5 },
    );
  }

  // --- Footer on every page ----------------------------------------------
  const pages = doc.getPages();
  const footerNote =
    variant === "portal"
      ? "Prepared for the client portal • Patrol Security Ecosystem"
      : "Patrol Security Ecosystem";
  pages.forEach((p: PDFPage, index: number) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN - 16 },
      end: { x: PAGE_WIDTH - MARGIN, y: MARGIN - 16 },
      thickness: 0.5,
      color: RULE,
    });
    p.drawText(`Generated ${formatDate(Date.now())} • ${footerNote}`, {
      x: MARGIN, y: MARGIN - 30, size: 8, font, color: MUTED,
    });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    p.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(pageLabel, 8),
      y: MARGIN - 30, size: 8, font, color: MUTED,
    });
  });

  return doc.save();
}

// pdf-lib has no automatic line wrapping; break on words, hard-split any
// single token wider than the column (URLs, long IDs).
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitizeText(text).split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
    }
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

// WinAnsi encoding can't represent every glyph (emoji etc.); map common
// typographic characters to ASCII and replace the rest instead of throwing
// mid-render.
const GLYPH_MAP: Record<string, string> = {
  "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'",
  "\u201C": '"', "\u201D": '"', "\u2022": "*", "\u2026": "...",
};
function sanitizeText(text: string): string {
  return text
    .replace(/[\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, (c) => GLYPH_MAP[c])
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

// details is free-form JSON from the app's report forms: render it as
// readable label/value pairs, flattening one level of nesting.
function flattenDetails(details: unknown): Array<[string, string]> {
  if (details == null || typeof details !== "object") return [];
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      const rendered = value
        .map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item)))
        .join("; ");
      if (rendered) entries.push([key, rendered]);
    } else if (typeof value === "object") {
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (subValue == null || subValue === "") continue;
        entries.push([
          `${key} - ${subKey}`,
          typeof subValue === "object" ? JSON.stringify(subValue) : String(subValue),
        ]);
      }
    } else {
      entries.push([key, String(value)]);
    }
  }
  return entries;
}

function humanizeKey(key: string): string {
  return capitalize(
    key
      .replace(/[_-]+/g, " ")
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase(),
  );
}

function typeLabel(type: string): string {
  return humanizeKey(type);
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos",
  });
}
