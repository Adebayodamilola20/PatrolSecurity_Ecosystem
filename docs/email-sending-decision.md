# System email sender: decided, waiting on DNS

**Status as of 2026-08-08:** address agreed, Resend configured, blocked only on
three DNS records being added by the domain host.

## The decision

The system sends as **`reports@evergreenprotectiveservices.com`**, confirmed by
the client. A dedicated system address, not a company mailbox and not Gmail.

## The domain confusion this resolved

Two similar domains exist and the first attempt used the wrong one:

| Domain | Reality |
|---|---|
| `evergreenprotection.com` | **Not the company's.** Namecheap nameservers, mail via `jellyfish.systems` |
| `evergreenprotectiveservices.com` | **The company domain.** Own nameservers, mail via `ezmail.evergreenprotectiveservices.com`, SPF references `plesk04.eznettools.net` |

`eznettools.net` is what the client calls "Ezonline" -- they host the domain,
its DNS, and the company mailboxes. A Resend domain for
`mail.evergreenprotection.com` had been created and could never have verified,
because that domain is not theirs. It has been deleted.

## Current Resend state

- Domain `evergreenprotectiveservices.com`, id `93425d78-771c-4f7a-8e3a-efdd674f72c7`
- Status `not_started` -- waiting on DNS
- The free plan allows exactly **one** domain, which is why the wrong entry had
  to be removed before the right one could be added

## The three records Ezonline/EzNetTools must add

Host values are **relative** to the domain -- entered as written, not as full
hostnames.

| Type | Host | Priority | Value |
|---|---|---|---|
| TXT | `resend._domainkey` | — | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDb+Th0bjsgxLAqKmI9IrYUkoH6xFMSf1QA8cu7OBzxYQV1HXdbEmy6d1w1NfT1yKIjeMi4kUMh0P50hfDbbNzurnQC0z8KmqUMh61X+f+T1zxoP9gfxq5k6ZsjoIUVHo135+Q73n5nDH1NIvI45nSnl68foB/SR0zwpVH1ARXiqwIDAQAB` |
| MX | `send` | 10 | `feedback-smtp.us-east-1.amazonses.com` |
| TXT | `send` | — | `v=spf1 include:amazonses.com ~all` |

**These cannot break the existing company email.** Every record sits under
`send.` or `resend._domainkey.`, never on the root, so the existing root MX
(`ezmail.…`) and mailboxes are untouched.

The root SPF ends in `-all` (hard fail), stricter than usual. It does not
conflict: Resend's envelope sender is `send.evergreenprotectiveservices.com`,
which carries its own SPF, so the root rule is never evaluated for this mail.
Worth knowing if EzNetTools query it.

## Once the records are live

1. Verify in Resend (dashboard, or `POST /domains/<id>/verify`)
2. Point the backend at the new sender:
   `npx convex env set RESEND_FROM_EMAIL "reports@evergreenprotectiveservices.com" --prod`
3. Send a test report and confirm delivery to a non-owner address -- that is the
   thing that has never worked

## Who has to act, and why it is slow

The domain is administered abroad. Every change goes through a contact the
client calls **Chief**, including creating new email addresses. So this is a
people bottleneck rather than a technical one, and each round trip is expensive.
Client replied "noted" on 2026-08-08; nothing has been requested of Chief yet.

Two options were put to him, deliberately in one message so a single round trip
resolves it either way:

**A — add the three DNS records above.** Preferred. One-time, no code change,
and Resend then reports which alerts actually delivered.

**B — create `reports@evergreenprotectiveservices.com` as an ordinary mailbox**
and share the login; the system sends through Ezonline's own server. No DNS
change at all, their existing SPF already authorises that server, and replies
land somewhere real.

### If B is chosen, two things must be settled first

1. **It needs a code change.** Convex's default runtime cannot open SMTP
   connections -- it does HTTP only. Sending through their server needs a
   `"use node"` action plus an SMTP client. Budget real work, not a config edit.
2. **Unconfirmed: does that host even allow it?** Many shared hosts refuse SMTP
   from an outside application. The user chose not to ask this, so it remains an
   open unknown -- confirm before building anything against option B.

Shared-hosting send limits (often a few hundred per hour) are unlikely to matter
at this volume, but are worth knowing.

## Fallback if Chief becomes a bottleneck

Register a separate domain (~$15/year) held directly by the team. No dependency
on anyone abroad, and no code change since Resend stays. The cost is that alerts
arrive from a domain that is not the company's main one. This is the answer if
Chief stalls -- not the opening position.

## Still undecided

Whether `reports@` should **receive** replies. Sending needs no mailbox, but a
client hitting reply on a report needs somewhere for it to land, or it bounces
silently. If replies are wanted, EzNetTools must also create the mailbox.
Option B answers this for free, since it is a real mailbox either way.

## Why this matters

Until this is done, Resend falls back to the shared `onboarding@resend.dev`
sender, which delivers **only to the Resend account owner**. Every report and
emergency alert aimed at a client or guard is silently going nowhere.
