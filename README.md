# My Tapsihan — Next.js 16 rewrite

This is a full rewrite of the original `client/` + `server/` project into a
single Next.js 16 (App Router) app, matching the target stack below.

## Stack

| Area | Tech |
|---|---|
| Core | Next.js 16 (App Router), React 19, TypeScript 5.7 |
| Database | PostgreSQL (Neon) + Prisma 6 |
| Auth | Auth.js / NextAuth v5 (beta), bcryptjs |
| Real-time | Pusher (server SDK) + pusher-js (client SDK) |
| Validation | Zod |
| Styling / UI | Tailwind CSS 3.4, tailwindcss-animate, CVA, clsx, tailwind-merge, Radix UI, Lucide React |
| Storage / utilities | Vercel Blob, qrcode, date-fns |
| Dev tooling | ESLint 9, tsx |
| Deploy | Vercel |

## Where everything went (old → new)

| Old (Express + Vite) | New (Next.js) |
|---|---|
| `server/src/routes/*.js` | `src/app/api/**/route.ts` |
| `server/src/middleware/auth.js` (JWT) | `src/lib/auth.ts` (NextAuth v5, JWT session strategy) |
| `server/prisma/schema.prisma` | `prisma/schema.prisma` (unchanged models) |
| `server/src/services/paymentFlow.js` | `src/lib/services/paymentFlow.ts` |
| `server/src/services/printer.js` (ESC/POS + mock) | `src/lib/services/printer.ts` (mock only — see below) |
| `server/src/services/barcode.js` (bwip-js + qrcode) | `src/lib/services/codes.ts` (qrcode only — see below) |
| Socket.IO server + `useSocket.js` | `src/lib/pusher.ts` + `src/lib/pusher-client.ts` + `usepusherEvent.ts` |
| `client/src/pages/Kiosk` | `src/app/kiosk/page.tsx` |
| `client/src/pages/QR` | `src/app/order/page.tsx` |
| `client/src/pages/Staff` | `src/app/staff/page.tsx` (login is now the single page at `src/app/login/page.tsx`) |
| `client/src/pages/Admin` | `src/app/admin/page.tsx` (login is now the single page at `src/app/login/page.tsx`) |
| `client/src/components/*` | `src/components/order/*`, `src/components/staff/*`, `src/components/admin/*` |
| `client/src/hooks/*` | `src/hooks/*` |
| `RequireAuth.jsx` (localStorage check) | `src/middleware.ts` (server-side session check) |

## Three deliberate stack changes worth knowing about

Your target stack list didn't include a few packages the original app relied
on for hardware/payment integrations. Here's what changed and why:

1. **Barcodes → QR codes.** The original used `bwip-js` to render a Code128
   barcode for the counter/kiosk ticket (for a USB barcode scanner) and
   `qrcode` separately for the digital receipt. Since only `qrcode` is in
   your stack, both now use QR codes (`src/lib/services/codes.ts`). Most USB
   "keyboard wedge" scanners read QR codes fine, so the staff scan-to-confirm
   flow in `src/components/staff/StaffScreen.tsx` works the same way. If your
   scanner truly can't read QR, swap in `bwip-js` there — it's a one-file
   change.

2. **Real thermal printing removed.** The original supported
   `PRINTER_MODE=real` using `escpos` + `escpos-network` over raw TCP
   sockets. Those aren't in your stack, and long-lived TCP sockets don't fit
   well in Vercel's serverless functions anyway. `src/lib/services/printer.ts`
   now only does mock/log-mode printing (tickets are logged to the console
   and kept in an in-memory list at `/api/dev/print-log`), so the whole order
   flow still works end-to-end without hardware. For real printing on
   Vercel, the two common patterns are a small always-on "print bridge"
   service that polls an API route, or a receipt page you `window.print()`
   from a device at the counter.

3. **PayMongo removed.** GCash works with the store's own static QR: the
   customer pays from their GCash app, and staff confirm it on the Staff
   screen by typing the GCash reference number and the amount received. Every
   payment (cash and GCash) goes through `markOrderPaid` in
   `src/lib/services/paymentFlow.ts`. `POST /api/dev/simulate-gcash-paid`
   exists for local testing only and needs `ALLOW_PAYMENT_SIMULATION=true`.

## Dependency versions

All packages are pinned to their current latest release as of writing, with
three deliberate exceptions where jumping to the newest major would mean a
much bigger, unrelated migration:

- **Prisma stays on 6.x** (`^6.19.0`, the last 6.x release), not 7. Prisma 7
  replaced the `prisma-client-js` generator with a new `prisma-client`
  generator, dropped the Rust query engine, and requires an explicit driver
  adapter (e.g. `@prisma/adapter-pg`) — a real migration, not a version bump.
- **`tailwind-merge` stays on 2.x**, not 3. `tailwind-merge` v3 only supports
  Tailwind CSS v4; this project uses Tailwind CSS 3.4 as specified, and v2.6.0
  is the last version built for it.
- **ESLint stays on 9.x**, not 10. ESLint 9 is out of active support, but
  ESLint 10 removes the legacy-config compatibility layer this config relies
  on (`@eslint/eslintrc`'s `FlatCompat`), and `eslint-config-next`'s ESLint 10
  support wasn't confirmed at the time of writing. Lint tooling doesn't affect
  the app at runtime, so this is safe to revisit later.

Everything else moved to a real latest major where one existed since the
initial version: `next-auth` (beta.25 → beta.32, needed for Next 16 support),
`zod` (3 → 4), `bcryptjs` (2 → 3, now ESM-first — this project uses its named
`hash`/`compare` exports rather than a default import), `lucide-react` (0 →
1), and `@vercel/blob` (0 → 2). `next`, `react`, and the Radix packages were
already on caret ranges that resolve to their latest version automatically,
so no version bump was actually needed there — `npm install` already gets
you the newest release within each.

## Setup

```bash
npm install
cp .env.example .env
# edit .env now (DATABASE_URL, PRINT_BRIDGE_KEY, etc.)

npx prisma db push --force-reset   # wipes the DB, so only run on a dev database

npm install jspdf                  # already listed in package.json, so this is harmless
npm run seed                       # prints random admin/staff passwords once, so save them

npm run build
npm run lint
npm test
npm run dev
```

> **`npm run seed` no longer creates sample Menu Items or Inventory Items.**
> It only seeds the 8 Menu Item categories listed below, the standard units
> of measure, and the two logins. The real menu is entered by hand, item by
> item, from **Admin > Menu Items** — this avoids ever having to hunt down
> and delete/overwrite placeholder products that don't match what's
> actually on the shop's signage. Likewise, real stock is entered from
> **Admin > Inventory Items**. Once you've added an Ingredient named
> "Rice" and some Lugaw items there, `npm run backfill:lugaw-rice` will
> link Rice to them (1 cup each) — running it before those exist just logs
> that it found nothing to link.

> **Why `prisma db push`, not `prisma migrate dev`:** this project has no
> `prisma/migrations` folder — the schema has always been kept in sync with
> the database via `db push` rather than tracked migrations. Running
> `prisma migrate dev` (or `migrate reset`) here will fail or wipe your
> database without recreating any tables, since there's no migration
> history for it to replay. Stick to `db push` for any future schema
> changes too (`npx prisma db push` without `--force-reset` for a
> non-destructive sync once you already have real data).

> **`--force-reset` drops all existing data.** Only use it on a fresh
> database or when you're OK losing everything and starting over. For a
> database that already has real orders/menu data, run `npx prisma db push`
> (no flag) instead — it applies schema changes without wiping rows, as
> long as the change itself doesn't conflict with existing data.

> **Note:** `prisma.config.ts` explicitly loads `.env` via `import
> "dotenv/config"`. This is required — as soon as a `prisma.config.ts` file
> exists, the Prisma CLI stops auto-loading `.env` on its own ("Prisma config
> detected, skipping environment variable loading"), so without that import
> `prisma db push` / `prisma db seed` fail with "Environment variable not
> found: DATABASE_URL" even with a correctly filled-in `.env`. This only
> affects standalone CLI commands — `next dev` / `next start` load `.env`
> themselves regardless.

First logins: `npm run seed` creates a `staff` (counter → `/staff`) and an
`admin` (dashboard → `/admin`) account with **random passwords printed once in
the terminal** (or the ones you set in `SEED_ADMIN_PASSWORD` /
`SEED_STAFF_PASSWORD`). `.env.example` sets these to `admin` / `staff` for local
dev only; change or remove them before seeding a live database. Both accounts
must choose their own password the first time they log in.

Generate `AUTH_SECRET` with `openssl rand -base64 32` (or `npx auth secret`).
Never reuse a value from an example file.

## Sign-in security

How accounts and passwords are protected, so you know what to expect:

- **Your own password to change accounts.** Creating an account,
  resetting a password, and deactivating/reactivating all ask the acting
  admin to re-type *their own* password. Being logged in isn't enough, so an
  unlocked counter PC can't be used to take over accounts. Wrong attempts are
  throttled (5 in 15 minutes) and recorded in the Audit Log.
- **Temporary passwords are one-time.** A reset (or a new account) sets
  `mustChangePassword`. Until the person picks their own password at the
  Change password screen, every other page and API refuses them. The reset
  password is shown once, in a dialog with a Copy button.
- **Password changes end old sessions.** Each change/reset increments
  `Staff.sessionVersion`; a login token whose copy doesn't match is rejected
  on the next request. Deactivating or demoting an account also takes effect
  immediately. Sessions last at most 12 hours.
- **Password rules** (`src/lib/password-policy.ts`, used by the browser and the
  server): at least 8 characters, a letter and a number, not a common
  password or the username, and at most 72 bytes (bcrypt ignores the rest).
- **Login throttling.** Failed logins are counted in the database
  (`AuthFailure`): 5 per username+address, 30 per address, 20 per username,
  each per 15 minutes. Locks lift by themselves. An unknown username takes as
  long to reject as a wrong password, and every failure shows the same message,
  so the screen can't be used to discover usernames.
- **Admins can't reset each other (or themselves) from the dashboard.**
  An admin changes their own password from *Change password* (needs the
  current one). If an admin password is forgotten, someone with server access
  runs the console tool below.
- **Audit Log** entries now record the account id (`actorId`), admin sign-ins,
  lockouts, failed re-confirmations, and password changes. Passwords are never logged.

### Recovery from the server console

```bash
npm run auth -- reset admin          # new temporary password for "admin" (shown once)
npm run auth -- force-change         # every account must choose a new password at next login
npm run auth -- force-change staff   # just one account
npm run auth -- unlock admin         # clear failed-login lockouts
```

`reset` and `force-change` also sign out every session the account has open.

### Upgrading an existing database

```bash
npx prisma db push          # adds Staff.mustChangePassword / passwordChangedAt / sessionVersion, AuditLog.actorId, AuthFailure (no data is lost)
npm run auth -- force-change   # make existing accounts (e.g. the old admin123 / staff123 logins) pick a new password
```

Everyone is signed out once after the upgrade (old login tokens don't carry
the new password marker). If this project's `.env` values were ever shared or
committed (database URL, `AUTH_SECRET`, Pusher keys), rotate them — anyone with
`AUTH_SECRET` can forge login tokens.

Behind your own reverse proxy (not Vercel), make sure it *overwrites*
`X-Forwarded-For`; the per-address throttle trusts its first entry.

### Pusher

Create a free app at pusher.com (Channels product), then copy its App ID,
key, secret, and cluster into `.env` (both the server-side and the
`NEXT_PUBLIC_` client-side keys).

### Vercel Blob

Used for product image uploads in the admin Products tab. Locally, run
`vercel env pull` or set `BLOB_READ_WRITE_TOKEN` from your Vercel project's
Storage tab. Uploads are skipped gracefully if you never use that feature.

## Routes

- `/kiosk` — in-store kiosk ordering flow
- `/order` — QR/mobile ordering flow (what your table QR codes should link to)
- `/staff` — counter screen (scan-to-confirm cash, kitchen reprint, mark picked up) — requires staff/admin login
- `/admin` — dashboard, products, orders, reports — requires admin login

## Printers: two physical thermal printers, two separate devices

The counter/customer printer and the kitchen printer are two different
pieces of paper for two different readers, so they're two separate
RawBT-paired devices, not one printer doing double duty:

| | Prints | What's on it | Bridge page | Fires from |
|---|---|---|---|---|
| **Counter printer** | The customer's own receipt/pickup stub — prices, payment method, "thank you" | `printThermalRawBT.ts` | `/print-bridge` | The kiosk/counter device itself when checking out (`OrderFlow.tsx`) |
| **Kitchen printer** | The kitchen ticket — order number (large), items to make, any note. No prices, no payment info — the kitchen doesn't need the customer's receipt | `printKitchenTicketRawBT.ts` | `/print-bridge/kitchen` | Automatically, server-side, the instant an order is marked PAID (cash confirm or GCash) |

**Why a second document instead of just printing two copies of the same
receipt:** the kitchen doesn't need prices or "thank you for dining with
us" — handing them a price-bearing customer copy is the wrong document for
the wrong reader. The kitchen ticket is built specifically to answer "what
do I cook, and which order number does it belong to" — nothing else. That
same printed slip is also what travels back with the finished food, so
staff can glance at the order number on it and match the food to the right
customer without re-reading the whole queue.

**One-time setup for the kitchen printer**, on whatever device sits near
the kitchen (a second phone/tablet — doesn't need to be the same kind of
device as the counter one):
1. Install RawBT and pair it, over Bluetooth, to the **kitchen's own**
   thermal printer — not the counter one.
2. Open RawBT and select that printer (same 384 dots / 48mm setup as the
   counter printer, unless yours differs).
3. Open `/print-bridge/kitchen` in Chrome and leave the tab open, screen
   awake. The very first ticket may show a one-time "Open with RawBT?"
   prompt — check "Always open" so every print after that is silent, same
   as the counter bridge.

From then on, nothing else to do: the kitchen ticket prints on its own the
moment an order is paid. If a ticket jams, runs out of paper, or gets
lost, staff can re-send it without touching the order at all via the
printer icon on that order's card in **Staff > In the Kitchen** (the
"Reprint Kitchen Ticket" button) — see `/api/print-bridge/kitchen/request`.

### Two printers: kiosk printer + one shared counter/kitchen printer

If the kitchen has no printer of its own and shares the counter's, use this
layout (three kinds of order, two printers, two bridge phones):

| Device | Paired to | Keep this page open | Prints |
|---|---|---|---|
| **Phone A** (at the kiosk) | Printer 1 (kiosk) | `/print-bridge` | The receipt a kiosk customer takes at order time |
| **Phone B** (at the counter) | Printer 2 (counter + kitchen) | `/print-bridge/counter` | Kitchen tickets, receipts for orders staff enter at the counter, and the paid receipt for kiosk orders |
| **Staff PC** | nothing | none | Prints nothing itself: it asks Phone B through the server |

Who prints what is decided in one place, `src/lib/printRouting.ts`:

| Order came from | Receipt at order time | When staff confirm payment | Kitchen ticket |
|---|---|---|---|
| Kiosk | Printer 1 | Printer 2 (the customer is at the counter now) | Printer 2 |
| Staff "New Order" | Printer 2 | nothing extra (the kitchen ticket from the same printer shows the order number and items) | Printer 2 |
| QR (customer's phone) | nothing (digital receipt) | nothing | Printer 2 |

Rules:
- **Never open `/print-bridge/kitchen` and `/print-bridge/counter` on devices paired to the same printer**, or every kitchen ticket prints twice. `/print-bridge/kitchen` is only for a kitchen that has its OWN printer.
- `/print-bridge/counter` prints one job at a time with a short pause between them (`src/lib/printQueue.ts`): confirming a payment asks for a kitchen ticket and a receipt at the same instant, and RawBT can only start one job at a time.
- One phone can serve only ONE printer (RawBT prints to whichever printer is selected in its app), so two printers need two phones.
- **Kiosk tablet:** an Android tablet that has RawBT paired to a printer prints straight to it. If the kiosk tablet is Android but the printer is paired to a *different* phone (Phone A), open the kiosk once as `/kiosk?print=bridge` so it asks Phone A instead; the choice is remembered on that tablet (`?print=direct` switches it back). An iPad always uses the bridge.
- Every bridge phone needs the bridge key once: open its page as `.../print-bridge/counter?key=YOUR_PRINT_BRIDGE_KEY`.
- `/print-bridge/usb` (a printer on a Windows PC) is a different layout; don't run it alongside `/print-bridge/counter`, or staff-entered receipts print on both.

If `NEXT_PUBLIC_PUSHER_KEY` isn't set, neither bridge page can hear the
print events at all (both show "Realtime unavailable" instead of
"Waiting for orders…") — Pusher isn't optional for a hardware setup that
uses these bridges, even though the rest of the app degrades gracefully
without it.

## Menu Item categories

The 8 Menu Item categories seeded by `npm run seed` (and shown, in this
order, as the kiosk's tab bar) are transcribed from the shop's own physical
menu boards — not invented by the app. This is the reasoning behind each
one, kept here so it's easy to explain (e.g. to a reviewer) why a given item
belongs where it does:

| Category | Comes from | What belongs here |
|---|---|---|
| Lugaw | The board headed **"LUGAW"** | Plain, egg, arozzcaldo, tuwalya, laman loob, lomo, lechon, bulaklak, overload |
| Sizzling | The board headed **"KUY'S SIZZLING"** | Every sizzling-plate item (liempo, porkchop, pork rbq, chicken quarter/wings, beef tapa, porksisig, sausage, bangus, tahong, burger steak, dinuguan, t-bone, porter house) |
| Silog Meals | The board headed **"SILOG MEALS"** | Every rice + egg + ulam combo, named to match the board's own wording exactly |
| Soup | The board headed **"SOUP MENU"** | Pares, mami, papaitan, pata, bulalo |
| Side Order | Top half of the **"SIDE ORDER / DRINKS"** board | Rice, lechon kawali, sisig variants, chicharon bulaklak, chicken wings — food, not drinks |
| Drinks | Bottom half of that same board | Bottled water, sodas, juice — kept separate from Side Order because it's a visually distinct section on the sign, with its own small/large pricing |
| Special Meal | Every standalone poster that ISN'T under a shared board | Chicken Inasal, Letchon Manok, Bicol Express, Spicy Adobong Peking Duck, the grilled fish promo, Laing, steamed Kang Kong, Mr. Baka steak meals. These are each sold on their own individual sign at the shop, never grouped the way Lugaw or Sizzling are — forcing one into, say, "Side Order" would misrepresent the real menu, so they get the one honest catch-all category instead |
| Add-Ons | Not a board at all — it's the shared picker `KioskMenu.tsx` opens when a Lugaw or Silog Meals item is tapped | Egg, tokwa, tokwa't baboy, lomo, lechon, bulaklak, extra rice, etc. One shared category (not one per parent item) by design — see `prisma/backfill-merge-addons-category.ts` |

The full version of this reasoning (with the "why is this here" answer for
each one) lives as comments directly on `productCategoryNames` in
`prisma/seed.ts`, and the tab order itself is defined in
`src/components/order/categoryIcon.tsx`'s `CATEGORY_ORDER` — the two are
meant to stay in sync. If a new category is ever added in Admin that isn't
in that list, it still shows up on the kiosk (appended at the end,
alphabetically) — nothing added in Admin silently disappears, it just won't
have a fixed position or a custom tagline until `CATEGORY_ORDER` and
`CATEGORY_TAGLINES` (in `KioskMenu.tsx`) are updated to include it.

## Deploy

Push to GitHub and import into Vercel. Set all `.env.example` variables as
Vercel project environment variables, then set your Neon `DATABASE_URL` and
run `npx prisma db push` once against it (Vercel's build step only generates
the client via `postinstall`; schema syncing should be run separately, e.g.
from your machine or a CI step pointed at the same `DATABASE_URL`). Run
`npm run seed` too if it's a fresh database with no data yet.

### Pushing to GitHub

**First time (no repo yet):**

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/Shenkien/tapsihan.git
git push -u origin main
```

Replace `<your-username>/<your-repo>` with your actual GitHub repo path —
create the (empty) repo on GitHub first if it doesn't exist yet.

**Already have a repo set up (pushing new changes):**

```bash
git add .
git commit -m "Describe what changed"
git push
```

If Vercel is already connected to that GitHub repo, pushing to the branch
it's tracking (usually `main`) triggers a new deploy automatically — no
extra step needed on Vercel's side.

**If `git push` asks for a password:** GitHub no longer accepts your
account password for this — use a
[personal access token](https://github.com/settings/tokens) as the
password instead, or push over SSH once you've added an SSH key to your
GitHub account.

#   t a p s i h a n  
 