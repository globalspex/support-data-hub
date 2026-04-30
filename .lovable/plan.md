

## Fix: Time Not Syncing from Teamwork

### Root cause

In `src/server/services/ticketNormalizer.ts:81`, Teamwork (Projects) tasks always set `actual_logged_time: null` with a comment saying "populated separately from time_entries in a later phase" — that phase was never built. Confirmed in DB: 0 of 9709 tickets have any logged time.

(Teamwork **Desk** tickets correctly read `t.timeSpent` on line 138 — so this is Projects-only.)

### Fix

Fetch time entries from Teamwork v3 in bulk during sync, aggregate by `taskId`, and write the totals onto each ticket.

1. **New adapter method** `fetchTimeEntriesByTaskId(cfg)` in `src/server/adapters/teamworkAdapter.ts`:
   - Calls `GET /projects/api/v3/time.json?page=N&pageSize=500` (paginated)
   - Sums `minutes + hours*60` per `taskId` → returns `Map<string, number>` of total **minutes** per task ID
   - Same auth/pagination pattern as `fetchTickets`

2. **Update `syncService.runSync`** (`src/server/services/syncService.ts`):
   - For Teamwork only: after `fetchTickets`, call `fetchTimeEntriesByTaskId` and pass the map into the normalize step
   - Set `normalized.actual_logged_time = (timeMap.get(externalId) ?? 0) / 60` (convert to hours, matching the units the rest of the app already uses for `monthly_included_hours`, etc.)

3. **Normalizer signature**: change `normalizeTeamworkTask(raw, baseUrl, loggedHours)` to accept the lookup result (or a map) and write it into `actual_logged_time`.

4. **Recalc** already runs at the end of `runSync` and reads `actual_logged_time` to compute `final_reportable_time` / `labor_cost` / `billable_value`, so once times populate, all downstream numbers update automatically.

### Units sanity check

- Teamwork time entries return `hours` (int) + `minutes` (int) per entry → store as **hours decimal** in `actual_logged_time` (e.g., 1h 30m = 1.5).
- This matches `monthly_included_hours` and existing report aggregation in `reportService.ts`.

### Files touched

- `src/server/adapters/teamworkAdapter.ts` — add `fetchTimeEntriesByTaskId`
- `src/server/adapters/types.ts` — extend `SourceAdapter` with optional `fetchTimeEntriesByTaskId?`
- `src/server/services/ticketNormalizer.ts` — accept logged-hours arg
- `src/server/services/syncService.ts` — fetch + pass times into normalize

After deploy: click **Sync now** on Integrations to backfill. Existing tickets will get their times on the next sync (the upsert by `external_ticket_id` updates in place).

### Open question

If the Teamwork `/time.json` endpoint returns thousands of entries and the sync hits the worker timeout again, do you want me to:

- **(a)** Page time entries client-side just like the Airtable fix (browser loops calling sync until done), or
- **(b)** Just fetch everything server-side and rely on the request finishing in time (simpler, may need batching later)?

Recommended: **(b)** first — time.json is usually fast. We can add pagination if it times out.

