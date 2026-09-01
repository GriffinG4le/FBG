# Fulfillment & Reconciliation System — MVP Roadmap

## The bottleneck this solves

Right now, reconciling a single event (SportPesa 7s) requires a manual, line-by-line audit across four disconnected sources: the TikoHub site export, a per-event Google Sheet, physical PDQ receipts, and memory of phone calls and swaps. That audit takes hours and depends entirely on one person doing detective work. This system exists to turn that audit into a report that runs in seconds, off data that was captured correctly the first time.

This is not a rebuild of FBG. FBG's Apps Script/Sheets architecture is being retired — its one validated idea (a structured stock catalog) carries forward; its row-mutation data model does not.

## Non-negotiable constraints

- **TikoHub's site and admin panel cannot be changed.** No API, no webhook, no code access. Any integration point must work through what's already exposed: the manual order export (CSV) and the human eye on the TikoHub dashboard.
- **The existing sheet stays the system of record until this proves itself.** Leadership trusts it. Nothing in this MVP requires anyone but the operator to change what they look at.
- **Tent connectivity is unreliable.** Anything used live at an event must work offline and sync later — this is the actual reason paper has survived as a fallback, and it must be solved directly, not worked around.
- **Speed beats structure.** If the tool is slower than writing on paper, staff will use paper. Every screen is designed against that failure mode first.

## Core architectural principle

Every reconciliation gap so far — unexpanded multi-unit orders, uncaptured offline sales, swaps, cash top-ups, sizing shifts at pickup — has the same root cause: the old model tracks *current state* (a row that gets overwritten) instead of *events that happened* (an append-only record of every unit's actual movement). Overwriting a row destroys the evidence of what changed. An event log preserves it.

**The model is two tables, not one status sheet:**
1. **Catalog** — what exists and what it costs (SKU, category, color, size, price, current qty).
2. **Ledger** — an append-only record of every unit's movement (intent, dispatch, swap, correction), each row immutable, each with an amount and a timestamp.

Stock levels, revenue, and reconciliation reports are never manually maintained — they are queries over the ledger. This is the fix; everything else below is implementation.

## Stack

- **Supabase (Postgres)** — catalog + ledger tables, row-level locking handled properly instead of `LockService` serialization; a real API surface if TikoHub integration ever becomes possible.
- **Next.js** — the operator-facing web app (fulfillment screen, reports).
- **PWA with offline queue** (service worker + local storage, syncs on reconnect) — solves the tent-connectivity problem directly instead of defaulting to paper.
- **n8n** — scheduled/manual CSV ingestion from the TikoHub export, and the weekly report send.

## Data model (MVP)

**`catalog`**
| column | type | notes |
|---|---|---|
| sku | text, PK | `Category\|Color\|Size` |
| category | text | e.g. Fan Jersey, Crew Neck, Bucket Hat |
| color | text | nullable (Bucket Hats have none) |
| size | text | nullable |
| price | numeric | KES — required for swap-delta math |
| qty | integer | current stock, derived but cached for fast reads |

**`ledger`**
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| order_ref | text | TikoHub order ID, or manual ref for event/cash sales |
| channel | text | Online / Event / Card / Manual |
| sku | text, FK → catalog | |
| qty_change | integer | signed; -1 on dispatch, +N on correction |
| event_type | text | Intent / Dispatch / Swap / Correction |
| amount | numeric | actual KES collected on this row (0 for Intent rows) |
| swap_of | uuid, nullable | FK to the ledger row this swap replaces, if applicable |
| notes | text | free text, human context only — never load-bearing for numbers |
| operator | text | who recorded it |
| created_at | timestamptz | |

`event_type = Intent` rows come from the TikoHub CSV import and represent what was ordered, never touching stock. `Dispatch` rows are written the moment something physically leaves the shelf, exactly as ordered. `Swap` rows replace an Intent or Dispatch with what actually left, with `amount` reflecting the true price delta. `Correction` rows are physical-count adjustments, same as `correctStock()` today.

## MVP phases

### Phase 0 — Foundation
**Goal:** the data model exists and is seeded with real prices.
- Stand up Supabase project, create `catalog` and `ledger` tables.
- Seed `catalog` from the current MasterStock export, adding the missing `price` column for every category (Fan Jersey, Crew Neck, Bucket Hat, Tank Top, etc.).
- **Done when:** every SKU FBG currently tracks has a correct price, queryable in one table.

### Phase 1 — CSV importer (TikoHub → Intent)
**Goal:** stop re-typing what TikoHub already knows.
- n8n (or a simple script) ingests the TikoHub shop-orders CSV export and writes one `Intent` row per unit per order — expanding multi-unit orders automatically, the exact failure that caused the SportPesa "-5 units in sheet" gap.
- Handles re-import safely (idempotent on order_ref + line number) so pulling the export mid-event doesn't duplicate rows.
- **Done when:** running the importer on a real TikoHub export produces the correct expanded unit count with zero manual row-splitting.

### Phase 2 — Fulfillment screen (the tent replacement for paper)
**Goal:** one live action that is the tent record, and gives you what to transcribe onto the TikoHub site and the sheet — same speed as writing on paper.
- Search by name, order ID, or phone — pulls the matching `Intent` row(s).
- **Confirm** (item goes out as ordered): one tap writes a `Dispatch` row, decrements `catalog.qty`.
- **Swap**: pick new SKU from the full catalog (not limited to one product line) → price delta is computed automatically from `catalog.price`, not typed → one tap writes a `Swap` row with the correct `amount`.
- Every action queues locally first and syncs when connectivity returns — no dead screen on bad tent Wi-Fi.
- **Done when:** a real swap (e.g. Crew Neck → Fan Jersey, +250) takes one search and two taps, and the resulting `amount` is correct without anyone doing mental math.

### Phase 3 — Reconciliation report
**Goal:** the actual bottleneck fix — the deliverable that proves this works.
- A report that joins `Intent` rows against `Dispatch`/`Swap`/`Correction` rows for a given event or date range and outputs: total units by SKU, total revenue, and a flagged list of any `Intent` row with no matching `Dispatch`/`Swap` (i.e. still outstanding).
- Output shape mirrors the SportPesa 7s executive summary (unit counts + revenue reconciliation), so it can be sanity-checked directly against a report you already trust.
- **Done when:** re-running this report against the actual SportPesa 7s dataset (imported once, retroactively) reproduces the same 316-unit / KES 790,000 result that took a full manual audit to reach — automatically.

## Explicitly out of scope for v1

- Event-based stock allocation UI (the original FBG Phase 5 scope) — not needed until multiple simultaneous events are running.
- Any live sync or API integration with TikoHub — blocked until the MVP proves itself and that conversation happens deliberately, not by accident.
- Multi-user roles/permissions — single-operator tool for now.
- Forecasting, demand prediction, or anything beyond describing what already happened.

## Definition of MVP done

The reconciliation report (Phase 3) produces, in one click, a result that previously took a multi-source manual audit — on real data, not a demo dataset. That is the "hours to seconds" moment, and it's the only metric that matters for this MVP. Everything else in the roadmap exists to make that report trustworthy.

## After MVP (not scoped yet, listed for context)

- Bring the reconciliation report to leadership as the proof point, using it to open the conversation about a real TikoHub data bridge (even a scheduled export handoff would remove the manual CSV pull in Phase 1).
- Multi-event support once a second concurrent event is actually happening.
- Retire the per-event Google Sheets once the report has been trusted against a few real events in a row — this is a decision for leadership to make, not a technical migration to force.
