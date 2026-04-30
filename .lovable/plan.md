

## Move Customer Data Management Out of Airtable

You want to stop relying on Airtable as the source of truth and manage company data (active status, website, care plan, account type, monthly hours, notes) directly in this app. Here's the plan.

### What changes for you

- The Companies page becomes the single place to add, edit, deactivate, and delete companies.
- Teamwork still flows in tickets and auto-creates company shells when a new `external_company_id` appears (unchanged).
- Airtable sync, the "Sync Airtable" button, and the Airtable secrets stop being used. We keep the `airtable_record_id` column in the DB (harmless) but remove all UI and server code that reads/writes Airtable.
- One-time CSV import: I'll add an "Import CSV" button on the Companies page so you can upload your `Customers - Active.csv` once to seed website/care plan/active status, matched by company name (with a preview + conflict report before committing).

### New / changed UI on `/admin/companies`

- Remove: "Sync Airtable" button, Airtable status column, Airtable-related toasts.
- Add: "New Company" button → dialog with fields (company_name, account_type, website, care_plan_type, monthly_included_hours, active_status, notes).
- Add: Row actions → Edit (existing), Deactivate/Activate toggle, Delete (with confirm; blocked if tickets reference it — soft-deactivate instead).
- Add: "Import CSV" button → upload, preview matches/unmatched/conflicts, confirm to apply.
- Keep: inline edit for the fields already editable today.

### API changes

- `POST /api/companies` — create company (admin only, Zod-validated).
- `DELETE /api/companies/$id` — delete if no tickets reference it; otherwise return 409 and suggest deactivate.
- `PUT /api/companies/$id` — keep, but **remove the `pushCompanyToAirtable` call**.
- `POST /api/companies/import` — accepts parsed CSV rows `[{ company_name, website, care_plan_type, active_status }]`, returns a dry-run diff; second call with `{ confirm: true }` applies updates. Matches by exact name (case-insensitive, trimmed). Unmatched rows are reported back, not auto-created (you can opt to create them from the preview).
- Delete: `src/routes/api/airtable.sync.ts`.

### Server / service changes

- Delete: `src/server/services/airtableService.ts`.
- Edit `src/routes/api/companies.$id.ts`: drop the Airtable import and the best-effort push block; response becomes `{ ok: true }`.
- No DB schema changes required. `airtable_record_id` column stays (nullable, ignored). Secrets `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME`, `Airtable_CustomerManagement` can be deleted from the Secrets panel after the code is removed (I'll remind you).

### CSV import details

- Parse client-side with `papaparse` (already a common Vite-friendly lib; will add as dep).
- Expected headers: `Company`, `Websites`, `Care Plan`, `Active-Inactive` (matches your existing file).
- Preview table shows: ✅ will update (N), ➕ not in DB / create? (N), ⚠️ conflicts where DB value differs from CSV (N) with per-row checkboxes.
- Apply step writes only the checked changes; logs a row in `sync_runs` with `source_name = 'csv_import'` for traceability.

### Files touched

- Edit: `src/routes/admin.companies.tsx`, `src/routes/api/companies.$id.ts`, `src/routes/api/companies.ts`
- Add: `src/routes/api/companies.import.ts`, `src/routes/api/companies.create.ts` (or fold create into `companies.ts` POST)
- Delete: `src/routes/api/airtable.sync.ts`, `src/server/services/airtableService.ts`
- Add dep: `papaparse` + `@types/papaparse`

### Open question

Your existing 70+ companies in the DB came from Teamwork ticket sync and have no website/care plan. Do you want me to:

- **(a)** Auto-run the CSV import against your uploaded `Customers - Active.csv` as part of this change (one-shot seed), or
- **(b)** Just ship the Import button and let you upload it manually when ready?

