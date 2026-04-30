## Sliding 90-day sync window + history import + purge

Goal: routine syncs only fetch the last N days of tickets/time so they finish fast and don't time out. History is opt-in. You can purge old rows when you want.

### What changes for you

**Integrations page (`/admin/integrations`)** — each source card gets:
- **Sync window (days)** input, defaults to **90**. Used by every routine sync.
- **Import history** button — opens a small dialog with a "From date" picker. Runs a one-shot sync that ignores the window and pulls everything updated since that date for that source only.
- **Purge old tickets** button — opens a confirm dialog showing how many rows would be deleted (tickets older than the chosen cutoff for that source). Asks you to type "PURGE" before it runs.

**Routine "Run sync" behavior**
- Computes `since = now - sync_window_days`.
- Pulls only tickets/time entries `updatedAfter` that date.
- Companies still sync in full (small list).
- Recalc only re-runs over tickets touched in this run, not the whole table.

**Sync Runs page** — already lists per-run `received/created/updated`. Each run row will also show the window used (e.g. "since 2026-01-30") in the error_details info entry, so you can audit.

### What stays the same

- Existing 9,000+ tickets in the DB are kept. The window only controls fetching.
- Reports show everything in the DB regardless of window.
- Auto-map and recalc still run after each sync.

### Database

One migration (schema only):
```
ALTER TABLE integration_connections
  ADD COLUMN sync_window_days INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN history_imported_through TIMESTAMPTZ NULL;
```

`history_imported_through` records the earliest date that's been backfilled, so the UI can tell you "history imported back to 2024-01-15".

### Technical changes

**Adapters** (`src/server/adapters/`)
- `SourceAdapter.fetchTickets(cfg, opts?: { since?: Date })` — already in the interface, now actually used.
- `teamworkAdapter.fetchTickets`: append `&updatedAfter=<ISO>&orderBy=updatedAt&orderMode=desc` to the v3 tasks URL when `since` is set. Stop paging once the last item's `updatedAt < since` (defense in depth in case the API ignores the filter).
- `teamworkAdapter.fetchTimeEntriesByTaskId(cfg, opts?: { since?: Date })`: add `&updatedAfter=<ISO>` (or `fromdate=` if v3 requires it — I'll verify against the response shape during implementation and fall back to client-side filtering if needed).
- `teamworkDeskAdapter.fetchTickets`: append `&updatedAfter=<ISO>` to `/tickets.json`. Drop the `messages` include — heavy and unused. Same early-stop.
- Both adapters: simple 429 backoff (wait 2s, retry up to 3 times) so a brief rate-limit doesn't kill the run.

**Sync service** (`src/server/services/syncService.ts`)
- Read `sync_window_days` from the integration row. If a `since` override is passed (history import), use that instead.
- Compute `since` and pass to `fetchTickets` and `fetchTimeEntriesByTaskId`.
- Track the IDs of tickets upserted in this run; pass them to `recalculate({ kind: 'ticket_ids', ids })` instead of `{ kind: 'source' }`. Big win on history imports too.
- Append an info entry to `sync_runs.error_details` like `{ stage: 'window', message: 'since=2026-01-30T...' }`.

**New endpoints** (`src/routes/api/`)
- `POST /api/integrations/import-history` — body `{ source_name, from_date }`. Admin-only, Zod-validated. Calls `runSync(source, { sinceOverride: fromDate })`. Updates `history_imported_through` to `min(existing, from_date)`.
- `POST /api/integrations/purge-old` — body `{ source_name, older_than_date, confirm: 'PURGE' }`. Admin-only. Returns `{ deleted: number }`. Uses `delete().lt('updated_at_source', cutoff).eq('source_system', source)`.
- `GET /api/integrations/purge-preview?source_name=…&older_than_date=…` — returns `{ count }` so the dialog can show how many rows will be deleted before you confirm.

**`POST /api/integrations`** — accept `sync_window_days` in the body and persist it.

**`GET /api/integrations`** — return `sync_window_days` and `history_imported_through` per row.

**UI** (`src/routes/admin.integrations.tsx`)
- Add the window input next to Enabled.
- Add an "Import history" Dialog (date picker + source select preset to current card + run button + busy state).
- Add a "Purge old tickets" Dialog (cutoff date defaults to `today - sync_window_days`, preview count, confirm-text input).

### Files

- Migration: `integration_connections.sync_window_days`, `integration_connections.history_imported_through`
- New: `src/routes/api/integrations.import-history.ts`
- New: `src/routes/api/integrations.purge-old.ts`
- New: `src/routes/api/integrations.purge-preview.ts`
- Edit: `src/server/adapters/types.ts` (already has the optional `since`, leave as-is)
- Edit: `src/server/adapters/teamworkAdapter.ts` (use `since`, drop messages, 429 backoff, time-entry filter)
- Edit: `src/server/adapters/teamworkDeskAdapter.ts` (use `since`, drop messages, 429 backoff)
- Edit: `src/server/services/syncService.ts` (read window, narrow recalc scope, accept `sinceOverride`)
- Edit: `src/routes/api/integrations.ts` (read/write `sync_window_days`)
- Edit: `src/routes/admin.integrations.tsx` (window input, history dialog, purge dialog)

### Defaults & safeguards

- New connections: `sync_window_days = 90`, `history_imported_through = NULL`.
- Purge requires typing "PURGE" and shows the count first; never deletes companies, mappings, or rules.
- Time-entry fetch is also windowed — that's the heaviest call and the main reason syncs were dying.
