import { supabaseAdmin } from '@/integrations/supabase/client.server';

const AIRTABLE_API = 'https://api.airtable.com/v0';
const AIRTABLE_PAGE_SIZE = 10;
const AIRTABLE_SOURCE = 'airtable';

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

interface AirtableSyncOptions {
  offset?: string | null;
  runId?: string | null;
}

function getConfig() {
  const token = process.env.Airtable_CustomerManagement;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;
  if (!token) throw new Error('Airtable_CustomerManagement secret is not configured');
  if (!baseId) throw new Error('AIRTABLE_BASE_ID is not configured');
  if (!tableName) throw new Error('AIRTABLE_TABLE_NAME is not configured');
  return { token, baseId, tableName };
}

function tableUrl() {
  const { baseId, tableName } = getConfig();
  return `${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableName)}`;
}

function authHeaders() {
  const { token } = getConfig();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function listRecordsPage(offset?: string | null): Promise<AirtableListResponse> {
  const url = new URL(tableUrl());
  url.searchParams.set('pageSize', String(AIRTABLE_PAGE_SIZE));
  if (offset) url.searchParams.set('offset', offset);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable list failed [${res.status}]: ${text}`);
  }
  return (await res.json()) as AirtableListResponse;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  return String(v);
}

function isActive(v: unknown): boolean {
  const s = str(v)?.toLowerCase();
  return s === 'active';
}

export interface AirtableSyncResult {
  pulled: number;
  created: number;
  updated: number;
  skippedInactive: number;
  errors: Array<{ recordId?: string; message: string }>;
}

export interface AirtableSyncProgressResult extends AirtableSyncResult {
  done: boolean;
  nextOffset: string | null;
  runId: string;
}

async function createSyncRun(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('sync_runs')
    .insert({ source_name: AIRTABLE_SOURCE, sync_type: 'manual', status: 'running' })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create Airtable sync run');
  return data.id;
}

async function updateSyncRun(runId: string, pageResult: AirtableSyncResult, done: boolean) {
  const { data: current, error: currentError } = await supabaseAdmin
    .from('sync_runs')
    .select('records_received, records_created, records_updated, error_details')
    .eq('id', runId)
    .single();
  if (currentError || !current) throw new Error(currentError?.message ?? 'Failed to load Airtable sync run');

  const priorErrors = Array.isArray(current.error_details) ? current.error_details : [];
  const nextErrors = [
    ...priorErrors,
    ...pageResult.errors.map((error) => ({
      stage: error.recordId ? `record:${error.recordId}` : 'record',
      message: error.message,
    })),
  ].slice(0, 50);

  const recordsReceived = Number(current.records_received ?? 0) + pageResult.pulled;
  const recordsCreated = Number(current.records_created ?? 0) + pageResult.created;
  const recordsUpdated = Number(current.records_updated ?? 0) + pageResult.updated;
  const status = done ? (nextErrors.length === 0 ? 'success' : recordsReceived > 0 ? 'partial' : 'error') : 'running';

  const { error: updateError } = await supabaseAdmin
    .from('sync_runs')
    .update({
      records_received: recordsReceived,
      records_created: recordsCreated,
      records_updated: recordsUpdated,
      error_count: nextErrors.length,
      error_details: nextErrors.length ? nextErrors : null,
      status,
      finished_at: done ? new Date().toISOString() : null,
    })
    .eq('id', runId);
  if (updateError) throw new Error(updateError.message);
}

async function failSyncRun(runId: string, pageResult: AirtableSyncResult, message: string) {
  const fatalErrors = [...pageResult.errors, { message }].map((error) => ({
    stage: error.recordId ? `record:${error.recordId}` : 'fatal',
    message: error.message,
  })).slice(0, 50);

  await supabaseAdmin
    .from('sync_runs')
    .update({
      records_received: pageResult.pulled,
      records_created: pageResult.created,
      records_updated: pageResult.updated,
      error_count: fatalErrors.length,
      error_details: fatalErrors,
      status: 'error',
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

export async function syncFromAirtable(options: AirtableSyncOptions = {}): Promise<AirtableSyncProgressResult> {
  const runId = options.runId ?? await createSyncRun();
  const page = await listRecordsPage(options.offset);
  const result: AirtableSyncResult = {
    pulled: page.records.length,
    created: 0,
    updated: 0,
    skippedInactive: 0,
    errors: [],
  };

  try {
    const { data: existingRows, error: exErr } = await supabaseAdmin
      .from('companies')
      .select('id, company_name, airtable_record_id');
    if (exErr) throw new Error(exErr.message);

    const byAirtableId = new Map<string, { id: string }>();
    const byNameLower = new Map<string, { id: string }>();
    for (const row of existingRows ?? []) {
      if (row.airtable_record_id) byAirtableId.set(row.airtable_record_id, { id: row.id });
      if (row.company_name) byNameLower.set(row.company_name.toLowerCase().trim(), { id: row.id });
    }

    for (const rec of page.records) {
      try {
        const f = rec.fields;
        const companyName = str(f['Company']);
        if (!companyName) {
          result.errors.push({ recordId: rec.id, message: 'Missing Company name' });
          continue;
        }

        const active = isActive(f['Active-Inactive']);
        const carePlan = str(f['Care Plan']);
        const website = str(f['Websites']);
        const payload = {
          company_name: companyName,
          care_plan_type: carePlan,
          website,
          active_status: active,
          airtable_record_id: rec.id,
        };

        const normalizedName = companyName.toLowerCase().trim();
        const matchById = byAirtableId.get(rec.id);
        const matchByName = !matchById ? byNameLower.get(normalizedName) : null;
        const matchedRow = matchById ?? matchByName;

        if (matchedRow) {
          const { error } = await supabaseAdmin
            .from('companies')
            .update(payload)
            .eq('id', matchedRow.id);
          if (error) throw new Error(error.message);
          result.updated++;
          if (!active) result.skippedInactive++;
          byAirtableId.set(rec.id, { id: matchedRow.id });
          byNameLower.set(normalizedName, { id: matchedRow.id });
        } else if (active) {
          const { data: inserted, error } = await supabaseAdmin
            .from('companies')
            .insert({ ...payload, source_name: AIRTABLE_SOURCE })
            .select('id')
            .single();
          if (error || !inserted) throw new Error(error?.message ?? 'Insert failed');
          result.created++;
          byAirtableId.set(rec.id, { id: inserted.id });
          byNameLower.set(normalizedName, { id: inserted.id });
        } else {
          result.skippedInactive++;
        }
      } catch (e) {
        result.errors.push({
          recordId: rec.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const done = !page.offset;
    await updateSyncRun(runId, result, done);
    return { ...result, done, nextOffset: page.offset ?? null, runId };
  } catch (e) {
    await failSyncRun(runId, result, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/**
 * Push selected fields back to Airtable for a given company id.
 * Only fires if the company has an airtable_record_id.
 */
export async function pushCompanyToAirtable(companyId: string): Promise<{ pushed: boolean; message?: string }> {
  const { data: row, error } = await supabaseAdmin
    .from('companies')
    .select('airtable_record_id, care_plan_type, website, active_status')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || !row.airtable_record_id) return { pushed: false, message: 'No Airtable record linked' };

  const fields: Record<string, unknown> = {};
  if (row.care_plan_type !== null) fields['Care Plan'] = row.care_plan_type;
  if (row.website !== null) fields['Websites'] = row.website;
  fields['Active-Inactive'] = row.active_status === false ? 'Inactive' : 'Active';

  const url = `${tableUrl()}/${row.airtable_record_id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable PATCH failed [${res.status}]: ${text}`);
  }
  return { pushed: true };
}
