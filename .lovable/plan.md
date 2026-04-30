## Auto-map + Bulk-map assignees

Goal: stop hand-mapping every raw assignee. Auto-create mappings whenever a sync sees a raw name that exactly matches an active team member, and give you one screen to bulk-map the rest.

### What changes for you

**On the Mappings page (`/admin/mappings`):**
- New top bar with two buttons:
  - **Auto-map by name** — scans all unmapped raw assignees, links any whose name matches an active team member (case/whitespace-insensitive). Shows a toast: "Mapped 12, 3 had no match."
  - **Save bulk mappings** — appears only when you've picked team members in the bulk panel below.
- The "Unmapped assignees" table gets a "Map to" dropdown per row that *stages* the choice instead of saving immediately. You pick for several rows, then click **Save bulk mappings** once. Recalculation runs once at the end (faster than per-row).
- A small note explains: "Auto-map runs automatically on every sync. Use this button to re-run it now."

**On every sync:**
- After tickets are pulled, before recalculation, the system auto-creates mappings for any raw assignees whose name matches an active team member. You'll see the count in the sync run summary (e.g. "Auto-mapped 4 new assignees").

### What stays the same

- Existing mappings are never overwritten. Auto-map only fills gaps.
- Manual one-row dropdowns on the Mapped table still work (to fix or clear a mapping).
- Money columns (Labor / Billable) still come from the mapped team member's rates.

### Matching rules

- Compare `assigned_name_raw` (lowercased, trimmed, collapsed whitespace) to `team_members.name` (same normalization), only `active_status = true` members.
- If exactly one team member matches → create mapping.
- If zero or 2+ match → skip (left for you to resolve in the bulk panel).
- Mapping is keyed by `source_name` + `raw_assigned_id` when available, otherwise by `raw_assigned_name`.

### Technical changes

**New service: `src/server/services/autoMapService.ts`**
- `autoMapAssignees(source?: SourceName)` — loads active `team_members`, loads existing `assigned_name_mappings`, queries distinct unmapped raw assignees from `tickets` (filtered by source if provided), inserts mappings for unique name matches. Returns `{ created, ambiguous, noMatch }`.

**Sync integration: `src/server/services/syncService.ts`**
- After ticket upsert, before `recalculate({ kind: 'source', source })`, call `autoMapAssignees(source)` and stash the count in `sync_runs.error_details` as an info entry (or a new column — using existing `error_details` JSON keeps the migration small; entries with `stage: 'auto_map'` aren't errors, just info).

**New endpoints:**
- `POST /api/assigned-mappings/auto-map` (`src/routes/api/assigned-mappings.auto-map.ts`) — admin-only, calls `autoMapAssignees()` for all sources, then `recalculate({ kind: 'all' })`. Returns counts.
- `POST /api/assigned-mappings/bulk` (`src/routes/api/assigned-mappings.bulk.ts`) — admin-only, accepts `{ items: [{ source_name, raw_assigned_name, raw_assigned_id, team_member_id }] }`, validates with Zod, inserts all rows in one batch, then runs `recalculate({ kind: 'all' })` once. Returns `{ created, skipped }`.

**UI: `src/routes/admin.mappings.tsx`**
- Add `bulkSelections` state: `Record<rowKey, team_member_id>`.
- Change the unmapped table's `onChange` to update state instead of POSTing.
- Add header buttons: **Auto-map by name** (calls auto-map endpoint, then `load()`) and **Save bulk mappings** (POSTs `/bulk` with collected items, then clears state and `load()`).
- Disable buttons while busy; show toast with returned counts.

### Migrations

None. Uses existing `assigned_name_mappings` and `team_members` tables.

### Files

- New: `src/server/services/autoMapService.ts`
- New: `src/routes/api/assigned-mappings.auto-map.ts`
- New: `src/routes/api/assigned-mappings.bulk.ts`
- Edit: `src/server/services/syncService.ts` (call auto-map before recalc)
- Edit: `src/routes/admin.mappings.tsx` (bulk staging + two new buttons)

### Open question

When auto-map finds **two team members with the same name** (rare, but possible if you have two "Alex"), it skips that raw assignee. Do you want me to (a) skip silently and let you map manually, or (b) surface a count + a list in the bulk panel so you know which ones need attention? Default if you don't pick: **(b)**.
