# Pending decision: what address does the system send email from?

**Status:** blocked on the client. Asked 2026-08-08, awaiting an answer.

## Where this stands today

Resend has **no verified domain**, so the system falls back to Resend's shared
`onboarding@resend.dev` sender. That address only delivers **to the Resend
account owner**. Every report email and emergency alert addressed to a client or
a guard is currently going nowhere, silently — no bounce, no error.

Everything else is built and working. This is the only thing standing between
the alerting system and real delivery.

## The question that was asked

> Should the system send reports and alerts from the existing company Gmail
> address, or does the company have a separate domain/email for the system?

## The catch in that question

**"Just use our Gmail" is not directly buildable.** Resend sends on behalf of a
domain you own and prove you own, via DNS records. Nobody can add DNS records to
`gmail.com`, so a plain `something@gmail.com` sender cannot be verified.

If the answer comes back "use our Gmail", the real follow-up is: *does the
company own a domain at all?* — because that decides which option below applies.

## The three viable options

**1. Company owns a domain (best).**
Add three DNS records at the registrar and verify in Resend. Sends as
`reports@theirdomain.com`. Best deliverability, looks professional, scales.
Cost: nothing beyond the domain they already pay for.

**2. Company has no domain.**
They buy one (~$10–15/year). Same as option 1 from there. Worth pushing for —
a security company emailing clients from a free address undercuts trust, and
this is a one-time setup.

**3. Genuinely must send from Gmail.**
Requires dropping Resend for Gmail SMTP with an app password. Caveats worth
stating plainly: ~500 emails/day cap, higher spam-folder risk for bulk/
transactional mail, and the credential is a standing password rather than a
revocable API key. This is a real code change, not a config change.

## Once there is an answer

For options 1 and 2, everything needed is already in place:

1. Resend dashboard → Domains → add the domain → it shows three records
2. At the registrar (Namecheap for `evergreenprotection.com`) → Advanced DNS.
   The Host field is **relative** to the domain — enter `resend._domainkey.mail`
   and `send.mail` exactly, without appending the domain. Namecheap adds it, and
   appending it yourself is the usual reason verification fails.
3. Reveal each full value with the `[...]` toggle; truncated values never verify
4. Verify in Resend, then set `RESEND_FROM_EMAIL` on the Convex prod deployment:
   `npx convex env set RESEND_FROM_EMAIL "reports@theirdomain.com" --prod`

Alert recipients themselves live in the `communicationSettings` table, not in
environment variables.

## Prior attempt

A domain `mail.evergreenprotection.com` was added in Resend
(id `90d6a603-ebf9-43f9-a45d-cb589648a639`) but its three records were never
added at Namecheap — all three read "Failed", and a DNS lookup on 2026-08-08
confirmed none of them exist. If that domain is the answer, the work is just
step 2 above. If the company uses a different domain, delete this one from
Resend first so it stops showing as failed.
