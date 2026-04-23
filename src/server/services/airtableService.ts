import { supabaseAdmin } from '@/integrations/supabase/client.server';

const AIRTABLE_API = 'https://api.airtable.com/v0';

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
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

async function listAllRecords(): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(tableUrl());
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url.toString(), { headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable list failed [${res.status}]: ${text}`);
    }
    const data = (await res.json()) as AirtableListResponse;
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
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

export async function syncFromAirtable(): Promise<AirtableSyncResult> {
  const records = await listAllRecords();
  const result: AirtableSyncResult = {
    pulled: records.length,
    created: 0,
    updated: 0,
    skippedInactive: 0,
    errors: [],
  };

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

  for (const rec of records) {
    try {
      const f = rec.fields;
      const companyName = str(f['Company']);
      if (!companyName) {
        result.errors.push({ recordId: rec.id, message: 'Missing Company name' });
        continue;
      }
      const active = isActive(f['Active-Inactive']);
      if (!active) {
        result.skippedInactive++;
        continue;
      }

      const carePlan = str(f['Care Plan']);
      const website = str(f['Websites']);

      const payload = {
        company_name: companyName,
        care_plan_type: carePlan,
        website,
        active_status: true,
        airtable_record_id: rec.id,
      };

      const matchById = byAirtableId.get(rec.id);
      const matchByName = !matchById ? byNameLower.get(companyName.toLowerCase().trim()) : null;

      if (matchById) {
        const { error } = await supabaseAdmin
          .from('companies')
          .update(payload)
          .eq('id', matchById.id);
        if (error) throw new Error(error.message);
        result.updated++;
      } else if (matchByName) {
        const { error } = await supabaseAdmin
          .from('companies')
          .update(payload)
          .eq('id', matchByName.id);
        if (error) throw new Error(error.message);
        result.updated++;
      } else {
        const { error } = await supabaseAdmin
          .from('companies')
          .insert({ ...payload, source_name: 'airtable' });
        if (error) throw new Error(error.message);
        result.created++;
      }
    } catch (e) {
      result.errors.push({
        recordId: rec.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
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
