# Fix: dashboard shows nothing after syncing

## What I actually found

The database is not empty — there are 47,120 tickets (30,033 Teamwork Projects, 17,087 Desk). The dashboard looks blank for four separate, confirmed reasons:

1. **Today's sync never ran.** The two runs started at 17:54 UTC today are still `status = running` with 0 records received, and never finished. Same pattern on several older runs. The sync endpoint queues a run row and then fire-and-forgets an internal request to itself; that background request is being dropped, so the work never happens and the run row stays "running" forever.
2. **Every ticket has an empty company.** `company_name` is NULL on all 47,120 rows (and `customer_name` is NULL too). So the "By company" report has nothing to group by, and per-company hours/overages are empty.
3. **Reports only read the first 1,000 tickets.** The summary endpoint currently returns `total_tickets: 1000` even with no filters, because the data API caps rows. Totals are computed in JavaScript over that truncated slice, so every KPI is wrong/tiny (0.05 actual hours instead of the real 772).
4. **No assignee is mapped.** There are 0 rows in the assignee mapping table, so labor cost and billable value are 0 everywhere and the "By team member" report is all "Unmapped".

## Plan

### 1. Make sync actually complete and report status
- Replace the fire-and-forget self-request with a reliable model: the browser kicks off a run, then repeatedly calls a "continue this run" endpoint that processes one bounded page of work per call and saves a cursor on the run row. This keeps each request well inside the time limit and gives real progress in the UI.
- Mark runs as `error` (with a message) when a run is abandoned or a page fails, and add a cleanup step that closes out the currently stuck `running` runs so Sync Runs stops lying.
- Show live progress (page X, records so far) on the Integrations and Sync Runs pages.

### 2. Populate company on every ticket
- Teamwork Projects: resolve each task's project, then the project's company, and write that name onto the ticket. Desk: resolve the ticket's customer and their company.
- Match to the local Companies list by normalized name so tickets roll up to the company records already managed in the app (371 exist).
- Add a backfill pass so the 47k existing tickets get their company filled in without a full re-sync.

### 3. Fix report totals
- Move the aggregation from JavaScript into database-side aggregate queries (SQL functions for summary, by-company, by-team-member, trends), so results cover all matching tickets instead of the first 1,000.
- Keep the same filter set (company, member, source, status, type, inbox, tag, date range, month/year).

### 4. Get assignees mapped
- Run auto-mapping against the raw assignee names now present on tickets, then surface every remaining unmapped name on the Mappings page for one-click bulk mapping.
- Recalculate labor cost, billable value, and reportable time after mapping so the KPIs fill in.

## Technical notes
- Sync: rework `src/routes/api/integrations.sync.ts` + `src/routes/api/internal.run-sync.ts` into a resumable paged runner in `src/server/services/syncService.ts`, with cursor/progress columns on `sync_runs` (migration).
- Company resolution: extend `src/server/adapters/teamworkAdapter.ts` (project → company sideload) and `teamworkDeskAdapter.ts` (customer → company), plus `ticketNormalizer.ts`; one-off backfill endpoint for existing rows.
- Reports: new SQL aggregate functions called from `src/server/services/reportService.ts`, replacing the `fetchTickets` + in-memory reduce path.
- Order of work: unstick sync → company resolution → SQL aggregation → mapping/recalc.

## Verification
After the change I'll confirm: a sync run reaches `success` with non-zero received; `company_name` is non-null for the large majority of tickets; `/api/reports/summary` reports ~47k tickets and ~772 actual hours; and the dashboard KPI cards and both report tables are populated.
