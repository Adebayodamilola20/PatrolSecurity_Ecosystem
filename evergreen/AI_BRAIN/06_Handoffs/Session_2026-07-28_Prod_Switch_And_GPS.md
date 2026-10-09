# 🔁 Session Handoff — 2026-07-28 → next session

Lead: [[Claude_Code]]. Read this before touching anything; it supersedes the
older "everything is on dev" assumption in [[Current_Task]].

---

## 1. THE BIG ONE — we are on PRODUCTION Convex now

`dev:resilient-buffalo-226` is **no longer the live backend.**

| | |
|---|---|
| **Live backend** | `harmless-pigeon-186` (prod) — `https://harmless-pigeon-186.convex.site/api/v1` |
| **Old dev** | `resilient-buffalo-226` — still populated, kept as fallback, nothing points at it |

Migration was a full snapshot: `convex export --include-file-storage` from dev →
`convex deploy` to prod → `convex import --prod --replace-all`. **678 documents +
8 stored files.** Every table count verified equal afterwards. Backups of BOTH
deployments were taken first (scratchpad zips, since expired — retake before any
future migration).

Repointed: `mobile/patrol_app/lib/utils/constants.dart`, `web/.env.local`,
`web-client/.env.local`, and the user set `VITE_API_URL` in **both** Vercel
projects (admin + client) themselves.

### Things that will bite you
- Convex source lives in **`mobile/patrol_app/convex/`**, NOT the repo-root
  `convex/` (that's boilerplate). Root `CLAUDE.md` is stale on this.
- Prod got a **fresh `PATROL_JWT_SECRET`**, deliberately NOT a copy of dev's —
  dev's leaked into a chat transcript. The two differ on purpose. Migrated
  refresh tokens were invalidated; everyone re-logged in once.
- `DEV_SEED_SECRET` is deliberately **unset on prod**, so `/dev/seed` returns 404
  there. Don't "helpfully" add it.
- `.env.local` files are gitignored — **Vercel reads `VITE_API_URL` from its own
  dashboard**. Editing the local file does nothing to the deployed sites, and a
  Vite env change needs a **redeploy** to take effect.

---

## 2. Shipped to `main` today

| Commit | What |
|---|---|
| `fa1b7e8` | Removed self-service password reset (both stubs lied about success); repointed mobile to prod |
| `3dfecd5` | GPS: sample the position stream, keep the tightest fix, instead of judging one cold reading |
| `a3dc8f5` | iOS precise-location detection + `NSLocationTemporaryUsageDescriptionDictionary` in Info.plist |
| `d8e4a56` | Address search: Nominatim → **Google Places Autocomplete** (+ Place Details for coords) |
| `df41d65` | Warm GPS subscription held for the shift |
| `d5c9eb4` | **Revert** of offline code that rode into `df41d65` by accident |
| `cdf19cf` | One shared GPS stream via broadcast controller instead of two competing subscriptions |

### Password reset — policy, not a bug
Removed deliberately at user's instruction. Client logins are created by staff
from the client dashboard, which is also where the password is set; admin uses a
shared credential for now. `/auth/change-password` remains and still requires the
current password. **Do not "restore" it.**

### Address search
`web/src/services/placesSearch.ts` — shared by `Checkpoints.tsx` and
`ClientDetail.tsx`. Autocomplete finds Nigerian house numbers ("2 Ajani Olujare
Street") that OSM cannot; **Text Search does not** — it was tried and missed the
address entirely, so don't "simplify" it back to one call. Nominatim kept as a
fallback when no key is set. Needed `https://places.googleapis.com` added to CSP
in `web/vercel.json`.

---

## 3. The GPS saga — resolved, but read the ending

**Symptom:** every scan failed with "GPS accuracy is too low (1414m)", the same
number to the metre, for hours.

**What it actually was:** three separate things stacked.
1. The scan took **one** cold GPS reading and judged it. A cold receiver returns a
   ~1400m cell-tower estimate before satellites lock. Fixed in `3dfecd5`.
2. Position pings were **dropped** when the reading was bad — and those pings were
   the only thing keeping the receiver warm. Self-feeding deadlock. Fixed by the
   shift-long warm subscription.
3. Warm tracking and the scan each opened their **own** `getPositionStream`. iOS
   does not reliably feed two concurrent subscriptions, so the scan's got nothing
   and timed out. Fixed in `cdf19cf` with one shared broadcast stream.

**Then the real blocker turned out to be the phone**, not the code:
`LOCATION UPDATE FAILURE: kCLErrorDomain error 0` — iOS's own location daemon had
wedged. **A phone restart fixed it.** Scans now succeed; prod went 12 → 14 scans.

### Lesson for next time (I got this wrong repeatedly)
I theorised iOS-permissions twice and was wrong both times. What actually settled
it was **telemetry**: `officerPositions.accuracy` in the DB showed the same phone
producing **13–25m** readings through the identical code path. That proved the
hardware and permissions were fine. **Check the data before theorising.**

### Still open (user declined / not needed yet)
- **Surface GPS accuracy in the admin UI.** `officerPositions.accuracy` is
  recorded on every ping and displayed **nowhere**. This is the highest-value
  monitoring gap — it would have shown this problem weeks before a scan failed.
- Distances varying 5m→42m from a stationary phone is **normal GPS drift**, not a
  bug. Don't tighten the geofence below ~50m or honest scans start failing.

---

## 4. Offline work — PAUSED, and now OFF the working tree

User directive, repeated firmly: **offline cache is not wanted right now.** It was
compiling into test builds (Flutter builds what's on disk, not what's committed)
and produced a "Scan Saved Offline" screen the user did not want to see.

- Parked on branch **`offline-work-paused`** (commit `8950b51`). Nothing lost.
- Working tree and `main` are clean of it. `flutter analyze` passes.
- Branch `offline-scan-sync-backend` (`27a5d0f`) holds the **Express** backend
  version of this work — that backend is legacy/dead, so that branch is worthless.
- **Do not merge either into `main` without being asked.**

⚠️ **I made a real mistake here:** `df41d65` accidentally committed the offline
work to `main` because `shift_provider.dart` had unstaged changes and I ran
`git add` on it. `main` then imported an untracked file and would not have built
from a clean clone. Reverted in `d5c9eb4`. **Stage against a clean file; check
`git diff --cached` before committing.**

---

## 5. Environment landmines

> **Update 2026-08-10 — the iCloud item below is RESOLVED.** The user approved the
> move after iCloud escalated from breaking release codesigning to corrupting the git
> object store (16 missing trees, 10 missing blobs, one missing commit) and gutting
> every `node_modules` while npm reported "up to date". The repo is now
> **`~/dev/PatrolSecurity_Ecosystem`**; everything below about `~/Desktop` describes
> the old location. The move was done by cloning from `git bundle --all`, not `mv` —
> `rm -rf` and `find` on the iCloud copy each ran past 10 minutes without finishing.
> Proof it worked: `npm ci` went from 3 minutes and a corrupt tree to 4 seconds clean.

- **The repo lived on `~/Desktop`, which is an iCloud Drive folder.** iCloud stamps
  `com.apple.FinderInfo` on files, and `codesign` refuses to sign a binary carrying
  it. **`flutter build ios --release` therefore fails** with
  "resource fork, Finder information, or similar detritus not allowed". Debug
  builds are unaffected, which is how testing has been happening.
  - The `build 2/`, `.dart_tool 2/`, `ephemeral 2/` folders are iCloud conflict
    copies from the same cause.
  - The user declined the move on 2026-07-28 and approved it on 2026-08-10; see the
    update at the top of this section.
- There are **five** Patrol folders. The real git repo is now
  `~/dev/PatrolSecurity_Ecosystem`. `Patrol_monitoring`, `patrol-watcher-main`,
  `~/PatrolSecurity_Ecosystem` and the old `~/Desktop/PatrolSecurity_Ecosystem` are
  all stale — never work in them.
- `flutter test` can fail on this Mac with "Connection closed before test suite
  loaded" — that's Gatekeeper quarantining `flutter_tester`, not a test bug. Fix:
  `xattr -r -d com.apple.quarantine /opt/homebrew/share/flutter/bin/cache`.

---

## 6. Security — NOT finished, needs the user

I leaked live secrets into a chat transcript by running `convex env list`, which
prints values. **Mask that output in future.**

- ✅ `DEV_SEED_SECRET` — rotated by me on dev
- ✅ `PATROL_JWT_SECRET` — prod given a fresh one; **dev still holds the leaked value**
- ❌ **`RESEND_API_KEY`, `TERMII_API_KEY`, `NVIDIA_API_KEY` — still need rotating at
  the providers.** Only the user can do this. Raise it once.
- The Google Maps browser key is in `web/.env.local` (gitignored). It ships publicly
  in the JS bundle by design, but **still needs HTTP-referrer + API restrictions**
  in Cloud Console. User was told; unconfirmed.

---

## 7. Data changes made directly in prod

- NASFAT site `radiusMeters`: **250 → 5000** (user request, via
  `convex run --prod sites:update`). IKA was already 5000.
- ⚠️ The **NASFAT checkpoint** has no `latitude`, no `longitude` and no
  `radiusMeters` — all three empty. The parent *site* has coordinates. Flagged to
  the user, not yet fixed. Worth revisiting.

---

## 8. Working style the user asked for

- **Short answers.** They said so repeatedly and got annoyed at long explanations.
- **Layman's terms**, not jargon, when explaining what went wrong.
- Yes/no questions want **yes or no first**, then the detail.
- They push back hard when I'm wrong — and they were right every time they did.
  Verify with data before asserting.

---

## Next session — likely starting points
1. Rebuild the app (`Dashboardz` marker and GPS diagnostics are already removed
   from `main`, but the phone still has the old build).
2. Confirm scanning works end to end now that the phone has been restarted.
3. Chase the three unrotated API keys.
4. Optional, previously offered and not taken: GPS-accuracy monitoring in the
   admin dashboard; the missing NASFAT checkpoint coordinates.

Relates to [[Current_Task]], [[Session_Log]], [[Claude_Code]].
