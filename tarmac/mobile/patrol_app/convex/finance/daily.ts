/**
 * The morning jobs: release held money whose date has come (6am), then the
 * daily money check (7am) comparing Monnify's records with ours.
 */
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getMonnifyConfig } from "../env";
import { accountTransactions, monnifyToken, parsePaidOn, verifyTransaction } from "./monnify";
import { createPayouts } from "./payouts";
import { audit, todayWat } from "./shared";

const DAY = 24 * 60 * 60 * 1000;
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** Branches whose release date has come: share their held payments and lift the hold. */
export const releaseDue = internalMutation({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const today = args.today ?? todayWat();
    const branches = (await ctx.db.query("finBranches").collect()).filter(
      (b) => b.active && b.onHold && b.holdReleaseOn && b.holdReleaseOn <= today,
    );
    let released = 0;
    for (const branch of branches) {
      const partner = branch.partnerId ? await ctx.db.get(branch.partnerId) : null;
      const held = (await ctx.db
        .query("finPayments")
        .withIndex("by_state", (q) => q.eq("state", "held"))
        .collect()).filter((p) => p.branchId === branch._id);
      for (const p of held) {
        await ctx.db.patch(p._id, {
          state: "shared",
          releasedAt: Date.now(),
          partnerId: partner?.status === "active" ? partner._id : undefined,
        });
        const updated = await ctx.db.get(p._id);
        if (updated) await createPayouts(ctx, updated);
        released++;
      }
      await ctx.db.patch(branch._id, { onHold: false, holdNote: undefined, holdReleaseOn: undefined });
      await audit(
        ctx,
        "monnify",
        "branch.released_on_date",
        "finBranch",
        branch._id,
        `${branch.name}: release date ${branch.holdReleaseOn} reached — ${held.length} held payment${held.length === 1 ? "" : "s"} (${naira(held.reduce((s, p) => s + p.amountKobo, 0))}) shared`,
      );
    }
    return released;
  },
});

export const monnifyClients = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("finClients").collect())
      .filter((c) => c.payProvider === "monnify" && c.payAccountRef)
      .map((c) => ({ id: c._id, name: c.name, ref: c.payAccountRef! })),
});

export const knownReferences = internalQuery({
  args: { references: v.array(v.string()) },
  handler: async (ctx, args) => {
    const known: string[] = [];
    for (const r of args.references) {
      const hit = await ctx.db
        .query("finPayments")
        .withIndex("by_reference", (q) => q.eq("reference", r))
        .first();
      if (hit) known.push(r);
    }
    return known;
  },
});

type Line = { tone: "good" | "warn" | "bad"; text: string };

/** Our own side of the check: anything stuck, failed or waiting. */
export const ourSide = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const lines: Line[] = [];
    const byStatus = async (s: "waiting" | "sending" | "needs_code" | "failed") =>
      await ctx.db
        .query("finPayouts")
        .withIndex("by_status", (q) => q.eq("status", s))
        .collect();
    const failed = await byStatus("failed");
    if (failed.length) lines.push({ tone: "bad", text: `${failed.length} payout${failed.length === 1 ? "" : "s"} failed (${naira(failed.reduce((s, p) => s + p.amountKobo, 0))}). Open Money out to try again.` });
    const needsCode = await byStatus("needs_code");
    if (needsCode.length) lines.push({ tone: "warn", text: `${needsCode.length} payout${needsCode.length === 1 ? " is" : "s are"} waiting for the Monnify email code.` });
    const waiting = await byStatus("waiting");
    if (waiting.length) {
      const reasons = [...new Set(waiting.map((p) => p.waitingFor).filter(Boolean))].slice(0, 3).join("; ");
      lines.push({ tone: "warn", text: `${naira(waiting.reduce((s, p) => s + p.amountKobo, 0))} cannot be sent yet — waiting for ${reasons}.` });
    }
    const stuck = (await byStatus("sending")).filter((p) => now - p.updatedAt > DAY);
    if (stuck.length) lines.push({ tone: "bad", text: `${stuck.length} payout${stuck.length === 1 ? " has" : "s have"} been "sending" for over a day. Call Monnify with the reference.` });
    const held = await ctx.db.query("finPayments").withIndex("by_state", (q) => q.eq("state", "held")).collect();
    const oldHeld = held.filter((p) => now - p.receivedAt > 30 * DAY);
    if (oldHeld.length) lines.push({ tone: "warn", text: `${naira(oldHeld.reduce((s, p) => s + p.amountKobo, 0))} has been on hold for more than 30 days.` });
    const since = now - DAY;
    const unmatched = (await ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "finance.payment.unmatched")).collect()).filter(
      (a) => a.timestamp >= since,
    );
    if (unmatched.length) lines.push({ tone: "bad", text: `${unmatched.length} payment${unmatched.length === 1 ? "" : "s"} arrived for an account we do not know. Check Monnify.` });
    const yesterday = await ctx.db.query("finPayments").withIndex("by_receivedAt", (q) => q.gte("receivedAt", since)).collect();
    return { lines, paymentsLastDay: yesterday.length };
  },
});

export const saveCheck = internalMutation({
  args: {
    lines: v.array(v.object({ tone: v.union(v.literal("good"), v.literal("warn"), v.literal("bad")), text: v.string() })),
    recovered: v.number(),
  },
  handler: async (ctx, args) => {
    const ok = !args.lines.some((l) => l.tone === "bad");
    await ctx.db.insert("finChecks", { day: todayWat(), ranAt: Date.now(), ok, lines: args.lines, recovered: args.recovered });
    // Keep about three months of checks.
    const old = await ctx.db.query("finChecks").withIndex("by_ranAt", (q) => q.lt("ranAt", Date.now() - 95 * DAY)).take(50);
    for (const c of old) await ctx.db.delete(c._id);
  },
});

export const latestCheck = internalQuery({
  args: {},
  handler: async (ctx) => {
    const c = await ctx.db.query("finChecks").withIndex("by_ranAt").order("desc").first();
    return c ? { day: c.day, ranAt: c.ranAt, ok: c.ok, lines: c.lines, recovered: c.recovered } : null;
  },
});

/**
 * The daily money check. Finds payments Monnify has that we missed (and
 * records them), re-asks Monnify about payouts still sending, and lists
 * anything that needs a person.
 */
export const moneyCheck = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; recovered: number }> => {
    const lines: Line[] = [];
    let recovered = 0;
    const cfg = getMonnifyConfig();
    if (!cfg) {
      lines.push({ tone: "warn", text: "Monnify is not connected, so only our own records were checked." });
    } else {
      try {
        await ctx.runAction(internal.finance.payouts.recheckSending, {});
        const token = await monnifyToken(cfg);
        const clients = await ctx.runQuery(internal.finance.daily.monnifyClients, {});
        let unreadable = 0;
        for (const c of clients) {
          const txns = await accountTransactions(cfg, token, c.ref);
          if (!txns) {
            unreadable++;
            continue;
          }
          const known = new Set(await ctx.runQuery(internal.finance.daily.knownReferences, { references: txns.map((t) => t.reference) }));
          for (const t of txns) {
            if (known.has(t.reference)) continue;
            const check = await verifyTransaction(cfg, t.reference);
            if (!check.paid) continue;
            const r = await ctx.runMutation(internal.finance.monnify.recordWebhookPayment, {
              accountRef: c.ref,
              reference: t.reference,
              amountKobo: Math.round(check.amountPaid * 100),
              receivedAt: parsePaidOn(t.paidOn),
            });
            if (r.status === "recorded") recovered++;
          }
        }
        if (recovered) lines.push({ tone: "warn", text: `Found ${recovered} payment${recovered === 1 ? "" : "s"} Monnify had that we had missed. ${recovered === 1 ? "It is" : "They are"} now recorded and shared.` });
        if (unreadable) lines.push({ tone: "warn", text: `Could not read ${unreadable} client account${unreadable === 1 ? "" : "s"} from Monnify today.` });
        else lines.push({ tone: "good", text: `Every payment in Monnify for ${clients.length} client account${clients.length === 1 ? "" : "s"} is in our records.` });
      } catch {
        lines.push({ tone: "bad", text: "Could not reach Monnify for the check. It will run again tomorrow, or press Check now." });
      }
    }
    const ours = await ctx.runQuery(internal.finance.daily.ourSide, {});
    lines.push(...ours.lines);
    if (!lines.some((l) => l.tone !== "good")) lines.push({ tone: "good", text: "Nothing needs attention." });
    await ctx.runMutation(internal.finance.daily.saveCheck, { lines, recovered });
    return { ok: !lines.some((l) => l.tone === "bad"), recovered };
  },
});
