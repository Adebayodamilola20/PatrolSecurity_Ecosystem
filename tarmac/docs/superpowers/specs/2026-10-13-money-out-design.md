# Tarmac finance — money out, checks and photos (design)

Approved by the owner in chat on 2026-10-13 ("start with all of this").
Covers the remaining invoice items: B1 automatic sending, release on a set
date, daily money check; B3 staff photos; bank-account checking. Attendance
(B4) is deliberately left out for now (owner's call).

## Why
Today the system records the 4 shares of every payment, but the money stays
in Head Office's one Monnify wallet. Tarmac bought "every payment shared and
sent automatically". Elderly admins also type bank numbers by hand with no
check, so one wrong digit would send money to a stranger.

## Decisions (owner)
- Only Head Office has Monnify. Branches and partners use normal banks.
- Bank accounts: pick the bank from a list, type the number, the system asks
  the bank (Monnify name enquiry) and shows the real name. Wrong number →
  "Account not found", nothing saved.
- No attendance yet.

## How it works
1. **Bank check.** `GET /api/v2/disbursements/account/validate`. The name
   saved is always the bank's answer, never what was typed. Used for partner,
   branch salary, Head Office and VAT accounts (required), and staff accounts
   (checked when Monnify is connected).
2. **Payouts.** When a payment is shared (straight away, on release, or on the
   release date), 4 payout rows are made: Head Office, VAT, partner, salary.
   Each gets its destination from the accounts at that moment. No account yet
   → "waiting", and it fills in automatically once the account is added.
3. **Sending.** Monnify single transfer (`POST /api/v2/disbursements/single`)
   from the Head Office wallet. A payout is claimed ("sending") before the
   call; a retry after an unclear answer re-uses the same reference, which
   Monnify refuses to pay twice. Only a definite failure gets a new reference.
   If Monnify asks for an email code (2FA), the payout waits for the admin
   to type it.
4. **Switch.** "Send money out automatically" is off until Tarmac's live
   Monnify account can send transfers. While off, an admin presses "Send now".
5. **Release on a set date.** Putting a branch on hold can carry a date; every
   morning (6am Nigerian time) branches whose date has come are released and
   their held payments are shared and sent.
6. **Daily money check** (7am): asks Monnify for each client account's recent
   payments and records any we missed (webhook lost); re-asks Monnify about
   payouts still "sending"; lists failed / waiting payouts and late held money.
   The result shows on the Overview, with "Check now".
7. **Staff photos.** Uploaded to Convex file storage, shown on staff records.

## Builder's calls (not discussed with the owner)
- Head Office branch with no partner: its partner share goes to the Head
  Office account instead of waiting forever.
- VAT account defaults to the Head Office account if none is set.
- The Monnify wallet number (from the Monnify dashboard) is a setting an admin
  types once; keys stay in Convex environment variables.

## Not in scope
Attendance, bulk transfers, Monnify sub-account settlement splits (they
cannot hold or release money, so they don't fit the hold rule).

## Change, 2026-10-14 (owner)
Head Office's Monnify wallet is "the Head Office account" — the pot every
payment lands in, and its balance is shown on the Overview. Head Office's 8%
and VAT stay in it; only the branch partner (34.5%) and branch salary (50%)
shares are sent out. A separate account for Head Office's share or for VAT is
optional. This replaces the earlier calls "VAT defaults to the Head Office
account" and "Head Office's partner share goes to the Head Office account":
both now simply stay in the wallet.
