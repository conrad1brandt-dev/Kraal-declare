# Kraal Declare — Web App

Livestock records and DVS Animal Health Declaration management for one establishment
with multiple owners, each with their own brand mark and eartags.

## What's inside
- **Animals** — individual records, dam/sire linkage, weight/health/breeding logs per animal, CSV import, eartag scan-input, active-herd count excludes sold/slaughtered
- **Owners & Brands** — one brand per owner (or "pending registration"), edit/delete, All/per-owner filter with auto-computed livestock summary, Market Reference Prices
- **Declarations** — one per 6-month period for the whole farm, auto-pulls numbers from your records as an editable starting point
- **Losses & Health** — ongoing dated logs (predator, theft, disease, health events with CSV import for bulk deworming/vaccination), Feed register
- **Slaughter** — weight, sold vs. own consumption, buyer details; auto-creates a matching Finance income entry; deleting reverts the animal to active
- **Finances** — income/expense tracking with edit/delete, plus a Reports view (monthly chart, category breakdown)
- **Grazing & Water** — dated condition snapshots with edit/delete and a quality trend chart
- **Permissions** — the establishment creator is admin (full edit/delete); everyone else who joins via invite code is view-only
- Works **offline** — installable PWA, saves queue locally and syncs when back online

- **Registers** — Livestock Register and Feed Register are print/PDF-ready (for state veterinary visits); Vet Drug/Treatment and Movements (Departure & Arrival) capture data now, with polished printable reports coming in a follow-up

## Step 1 — Supabase project
1. New Supabase project → **SQL Editor** → run `schema.sql`, then `migration_v2.sql`, `migration_v3.sql`, `migration_v4.sql` in that order
2. **Project Settings → API** → copy your **Project URL** and **anon/publishable key**

## Step 2 — Deploy
1. New GitHub repo → upload every file **and the `public` folder** at the top level — no extra nesting
2. Vercel → **Add New → Project** → import the repo → add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` → **Deploy**

## Step 3 — First use
1. Sign up, **create your establishment** (this makes you the admin)
2. Add owners and their brands under **Owners & Brands**
3. Add animals — manually, via CSV import, or by scanning eartags
4. Share your invite code (**More → Establishment settings**) with others — they join as view-only

## CSV import formats
**Animals:** `owner, eartag_number, species, breed_category, sex, dob, status` — owner blank = shared/communal animal
**Health events:** `owner, eartag_number, species, event_type, date, note, next_due` — owner/eartag optional for farm-wide or species-wide entries

## Installing as an app (offline use)
On your phone's browser, "Add to Home Screen". The shell loads even with no signal; data syncs once you're back online.

