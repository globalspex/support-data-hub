import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { teamworkAdapter } from '../adapters/teamworkAdapter';
import { teamworkDeskAdapter } from '../adapters/teamworkDeskAdapter';
import type { SourceAdapter, SourceName, ConnectionConfig } from '../adapters/types';
import { normalizeTeamworkTask, normalizeDeskTicket, type NormalizedTicket } from './ticketNormalizer';
import { recalculate } from './calcService';

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

export async function runSync(source: SourceName) {
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

  const { data: runRow, error: runErr } = await supabaseAdmin
    .from('sync_runs')
    .insert({ source_name: source, sync_type: 'manual', status: 'running' })
    .select()
    .single();
  if (runErr || !runRow) throw new Error(runErr?.message ?? 'Failed to create sync run');

  const errors: Array<{ stage: string; message: string }> = [];
  let received = 0;
  let created = 0;
  let updated = 0;

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

    // Tickets
    const raws = await adapter.fetchTickets(cfg);
    received = raws.length;

    for (const r of raws) {
      try {
        const normalized: NormalizedTicket =
          source === 'teamwork'
            ? normalizeTeamworkTask(r, cfg.baseUrl)
            : normalizeDeskTicket(r, cfg.baseUrl);

        const { data: existing } = await supabaseAdmin
          .from('tickets')
          .select('id')
          .eq('source_system', normalized.source_system)
          .eq('external_ticket_id', normalized.external_ticket_id)
          .maybeSingle();

        const { error: upErr } = await supabaseAdmin
          .from('tickets')
          .upsert([normalized as never], { onConflict: 'source_system,external_ticket_id' });
        if (upErr) throw new Error(upErr.message);

        if (existing) updated++;
        else created++;
      } catch (e) {
        errors.push({
          stage: `ticket:${r.externalId}`,
          message: e instanceof Error ? e.message : String(e),
        });
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
        error_details: errors.length ? errors.slice(0, 50) : null,
      })
      .eq('id', runRow.id);

    await supabaseAdmin
      .from('integration_connections')
      .update({ last_sync_at: new Date().toISOString(), status: status === 'error' ? 'error' : 'ok' })
      .eq('source_name', source);

    // Run scoped recalc after the sync so calculated fields are fresh
    try {
      await recalculate({ kind: 'source', source });
    } catch (recalcErr) {
      const msg = recalcErr instanceof Error ? recalcErr.message : String(recalcErr);
      await supabaseAdmin
        .from('sync_runs')
        .update({
          error_count: errors.length + 1,
          error_details: [...errors, { stage: 'recalc', message: msg }].slice(0, 50),
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
        error_details: [...errors, { stage: 'fatal', message }].slice(0, 50),
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
