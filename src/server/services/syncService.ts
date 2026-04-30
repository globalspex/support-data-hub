import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { teamworkAdapter } from '../adapters/teamworkAdapter';
import { teamworkDeskAdapter } from '../adapters/teamworkDeskAdapter';
import type { SourceAdapter, SourceName, ConnectionConfig } from '../adapters/types';
import { normalizeTeamworkTask, normalizeDeskTicket, type NormalizedTicket } from './ticketNormalizer';
import { recalculate } from './calcService';
import { autoMapAssignees } from './autoMapService';

const ADAPTERS: Record<SourceName, SourceAdapter> = {
  teamwork: teamworkAdapter,
  teamwork_desk: teamworkDeskAdapter,
};

export async function getIntegration(source: SourceName) {
  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .select('*')
    .eq('source_name', source)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function testIntegration(source: SourceName) {
  const row = await getIntegration(source);
  if (!row || !row.base_url || !row.api_key_or_token) {
    return { ok: false, message: 'Connection not configured' };
  }
  const cfg: ConnectionConfig = {
    baseUrl: row.base_url,
    token: row.api_key_or_token,
    authType: row.auth_type ?? 'basic_token',
  };
  const result = await ADAPTERS[source].testConnection(cfg);
  await supabaseAdmin
    .from('integration_connections')
    .update({
      last_tested_at: new Date().toISOString(),
      status: result.ok ? 'ok' : 'error',
      notes: result.ok ? null : result.message,
    })
    .eq('source_name', source);
  return result;
}

export interface RunSyncOptions {
  /** Override the integration's configured window (used by history import). Date = include tickets updated >= this. */
  sinceOverride?: Date;
  /** If true, fetch everything (no window). */
  fullHistory?: boolean;
}

export async function createSyncRun(source: SourceName): Promise<string> {
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from('sync_runs')
    .insert({ source_name: source, sync_type: 'manual', status: 'running' })
    .select('id')
    .single();
  if (runErr || !runRow) throw new Error(runErr?.message ?? 'Failed to create sync run');
  return runRow.id;
}

export async function runSync(source: SourceName, opts: RunSyncOptions = {}, existingRunId?: string) {
  const row = await getIntegration(source);
  if (!row || !row.is_enabled || !row.base_url || !row.api_key_or_token) {
    throw new Error(`Integration "${source}" is not configured/enabled.`);
  }

  const cfg: ConnectionConfig = {
    baseUrl: row.base_url,
    token: row.api_key_or_token,
    authType: row.auth_type ?? 'basic_token',
  };
  const adapter = ADAPTERS[source];

  // Determine sync window
  let since: Date | undefined;
  if (opts.fullHistory) {
    since = undefined;
  } else if (opts.sinceOverride) {
    since = opts.sinceOverride;
  } else {
    const days = Number(row.sync_window_days ?? 90);
    if (Number.isFinite(days) && days > 0) {
      since = new Date(Date.now() - days * 86400000);
    }
  }
  const windowMessage = since ? `since=${since.toISOString()}` : 'since=ALL';

  const runId = existingRunId ?? (await createSyncRun(source));
  const runRow = { id: runId };

  const errors: Array<{ stage: string; message: string }> = [];
  const info: Array<{ stage: string; message: string }> = [{ stage: 'window', message: windowMessage }];
  let received = 0;
  let created = 0;
  let updated = 0;
  const touchedTicketIds: string[] = [];

  try {
    // Companies
    try {
      const companies = await adapter.fetchCompanies(cfg);
      for (const c of companies) {
        await supabaseAdmin
          .from('companies')
          .upsert(
            {
              source_name: source,
              external_company_id: c.externalId,
              company_name: c.name,
              active_status: c.active ?? true,
            },
            { onConflict: 'source_name,external_company_id' },
          );
      }
    } catch (e) {
      errors.push({ stage: 'companies', message: e instanceof Error ? e.message : String(e) });
    }

    // Tickets (windowed)
    const raws = await adapter.fetchTickets(cfg, since ? { since } : undefined);
    received = raws.length;

    // Time entries (windowed) — both Teamwork Projects and Teamwork Desk support time logs.
    let loggedHoursByTaskId: Map<string, number> | undefined;
    if (adapter.fetchTimeEntriesByTaskId) {
      try {
        loggedHoursByTaskId = await adapter.fetchTimeEntriesByTaskId(cfg, since ? { since } : undefined);
      } catch (e) {
        errors.push({
          stage: 'time_entries',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Normalize all tickets up front
    const normalizedAll: NormalizedTicket[] = [];
    for (const r of raws) {
      try {
        const normalized: NormalizedTicket =
          source === 'teamwork'
            ? normalizeTeamworkTask(r, cfg.baseUrl, loggedHoursByTaskId)
            : normalizeDeskTicket(r, cfg.baseUrl);
        normalizedAll.push(normalized);
      } catch (e) {
        errors.push({
          stage: `ticket:${r.externalId}`,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Bulk lookup existing external ids in chunks (to count created vs updated)
    const externalIds = normalizedAll.map((n) => n.external_ticket_id);
    const existingIds = new Set<string>();
    const LOOKUP_CHUNK = 500;
    for (let i = 0; i < externalIds.length; i += LOOKUP_CHUNK) {
      const slice = externalIds.slice(i, i + LOOKUP_CHUNK);
      const { data: existRows, error: existErr } = await supabaseAdmin
        .from('tickets')
        .select('external_ticket_id')
        .eq('source_system', source)
        .in('external_ticket_id', slice);
      if (existErr) {
        errors.push({ stage: 'lookup_existing', message: existErr.message });
        continue;
      }
      for (const row of existRows ?? []) existingIds.add(String(row.external_ticket_id));
    }

    // Bulk upsert in chunks
    const UPSERT_CHUNK = 500;
    for (let i = 0; i < normalizedAll.length; i += UPSERT_CHUNK) {
      const batch = normalizedAll.slice(i, i + UPSERT_CHUNK);
      const { data: upserted, error: upErr } = await supabaseAdmin
        .from('tickets')
        .upsert(batch as never[], { onConflict: 'source_system,external_ticket_id' })
        .select('id,external_ticket_id');
      if (upErr) {
        errors.push({ stage: 'upsert_batch', message: upErr.message });
        continue;
      }
      for (const row of upserted ?? []) {
        if (row.id) touchedTicketIds.push(row.id);
        if (existingIds.has(String(row.external_ticket_id))) updated++;
        else created++;
      }
    }

    const status = errors.length === 0 ? 'success' : received > 0 ? 'partial' : 'error';
    await supabaseAdmin
      .from('sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status,
        records_received: received,
        records_created: created,
        records_updated: updated,
        error_count: errors.length,
        error_details: [...errors, ...info].slice(0, 50),
      })
      .eq('id', runRow.id);

    await supabaseAdmin
      .from('integration_connections')
      .update({ last_sync_at: new Date().toISOString(), status: status === 'error' ? 'error' : 'ok' })
      .eq('source_name', source);

    // Auto-map best-effort
    try {
      const am = await autoMapAssignees(source);
      info.push({ stage: 'auto_map', message: `created=${am.created} ambiguous=${am.ambiguous} noMatch=${am.noMatch}` });
      await supabaseAdmin
        .from('sync_runs')
        .update({ error_details: [...errors, ...info].slice(0, 50) })
        .eq('id', runRow.id);
    } catch (amErr) {
      errors.push({ stage: 'auto_map', message: amErr instanceof Error ? amErr.message : String(amErr) });
      await supabaseAdmin
        .from('sync_runs')
        .update({ error_count: errors.length, error_details: [...errors, ...info].slice(0, 50) })
        .eq('id', runRow.id);
    }

    // Narrow recalc to tickets touched in this run.
    try {
      if (touchedTicketIds.length > 0) {
        await recalculate({ kind: 'ticket_ids', ids: touchedTicketIds });
      }
    } catch (recalcErr) {
      const msg = recalcErr instanceof Error ? recalcErr.message : String(recalcErr);
      await supabaseAdmin
        .from('sync_runs')
        .update({
          error_count: errors.length + 1,
          error_details: [...errors, { stage: 'recalc', message: msg }, ...info].slice(0, 50),
        })
        .eq('id', runRow.id);
    }

    return { runId: runRow.id, received, created, updated, errorCount: errors.length, status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from('sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'error',
        records_received: received,
        records_created: created,
        records_updated: updated,
        error_count: errors.length + 1,
        error_details: [...errors, { stage: 'fatal', message }, ...info].slice(0, 50),
      })
      .eq('id', runRow.id);
    throw e;
  }
}

export async function runSyncAllEnabled() {
  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .select('source_name')
    .eq('is_enabled', true);
  if (error) throw new Error(error.message);
  const results: Array<{ source: string; ok: boolean; message?: string }> = [];
  for (const row of data ?? []) {
    try {
      const r = await runSync(row.source_name as SourceName);
      results.push({ source: row.source_name, ok: true, message: `Synced ${r.received}` });
    } catch (e) {
      results.push({ source: row.source_name, ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
