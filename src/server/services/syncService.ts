import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { teamworkAdapter } from '../adapters/teamworkAdapter';
import { teamworkDeskAdapter } from '../adapters/teamworkDeskAdapter';
import type { SourceAdapter, SourceName, ConnectionConfig, SyncRefs } from '../adapters/types';
import { normalizeTeamworkTask, normalizeDeskTicket, type NormalizedTicket } from './ticketNormalizer';
import { autoMapAssignees } from './autoMapService';

const ADAPTERS: Record<SourceName, SourceAdapter> = {
  teamwork: teamworkAdapter,
  teamwork_desk: teamworkDeskAdapter,
};

const MAX_TICKET_PAGES = 500;
const MAX_TIME_PAGES = 3000;
const MAX_REF_PAGES = 200;

interface RunCursor {
  refs?: SyncRefs;
  errors?: Array<{ stage: string; message: string }>;
  info?: Array<{ stage: string; message: string }>;
  timeEntries?: number;
}

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

function stageList(source: SourceName): string[] {
  return [
    ...ADAPTERS[source].refStages.map((s) => `ref:${s}`),
    'tickets',
    'timelogs',
    'finalize',
  ];
}

function nextStage(source: SourceName, current: string): string | null {
  const stages = stageList(source);
  const i = stages.indexOf(current);
  if (i === -1) return stages[0] ?? null;
  return stages[i + 1] ?? null;
}

function connectionConfig(row: {
  base_url: string | null;
  api_key_or_token: string | null;
  auth_type: string | null;
}): ConnectionConfig {
  return {
    baseUrl: row.base_url ?? '',
    token: row.api_key_or_token ?? '',
    authType: row.auth_type ?? 'basic_token',
  };
}

/** Create a run row and return its id. The client then drives it with stepRun(). */
export async function startRun(
  source: SourceName,
  opts: { since?: Date; fullHistory?: boolean; syncType?: string } = {},
): Promise<{ runId: string; stage: string; since: string | null }> {
  const row = await getIntegration(source);
  if (!row || !row.is_enabled || !row.base_url || !row.api_key_or_token) {
    throw new Error(`Integration "${source}" is not configured/enabled.`);
  }

  let since: Date | undefined;
  if (opts.fullHistory) since = undefined;
  else if (opts.since) since = opts.since;
  else {
    const days = Number(row.sync_window_days ?? 90);
    if (Number.isFinite(days) && days > 0) since = new Date(Date.now() - days * 86400000);
  }

  const firstStage = stageList(source)[0]!;
  const { data, error } = await supabaseAdmin
    .from('sync_runs')
    .insert({
      source_name: source,
      sync_type: opts.syncType ?? 'manual',
      status: 'running',
      stage: firstStage,
      stage_page: 1,
      since_at: since ? since.toISOString() : null,
      heartbeat_at: new Date().toISOString(),
      progress_message: 'Starting…',
      cursor: { refs: {}, errors: [], info: [{ stage: 'window', message: since ? `since=${since.toISOString()}` : 'since=ALL' }] },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create sync run');
  return { runId: data.id, stage: firstStage, since: since ? since.toISOString() : null };
}

export interface StepResult {
  done: boolean;
  runId: string;
  stage: string;
  page: number;
  received: number;
  created: number;
  updated: number;
  errorCount: number;
  status: string;
  message: string;
}

/**
 * Perform ONE bounded unit of work for a run (a single upstream page, or the
 * finalize step) and persist progress. Designed to be called repeatedly by the
 * browser so a multi-thousand-record sync never exceeds a request time budget.
 */
export async function stepRun(runId: string): Promise<StepResult> {
  const { data: run, error: runErr } = await supabaseAdmin
    .from('sync_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();
  if (runErr) throw new Error(runErr.message);
  if (!run) throw new Error('Sync run not found');

  const source = run.source_name as SourceName;
  const adapter = ADAPTERS[source];
  const cursor = (run.cursor ?? {}) as RunCursor;
  const refs: SyncRefs = cursor.refs ?? {};
  const errors = cursor.errors ?? [];
  const info = cursor.info ?? [];
  const stage = run.stage ?? stageList(source)[0]!;
  const page = run.stage_page ?? 1;
  const since = run.since_at ? new Date(run.since_at) : undefined;

  let received = run.records_received ?? 0;
  let created = run.records_created ?? 0;
  let updated = run.records_updated ?? 0;

  if (run.status !== 'running') {
    return {
      done: true, runId, stage: stage, page, received, created, updated,
      errorCount: run.error_count ?? 0, status: run.status, message: 'Run already finished',
    };
  }

  const row = await getIntegration(source);
  if (!row || !row.base_url || !row.api_key_or_token) {
    await failRun(runId, errors, info, 'config', 'Integration is not configured');
    return { done: true, runId, stage, page, received, created, updated, errorCount: errors.length + 1, status: 'error', message: 'Integration is not configured' };
  }
  const cfg = connectionConfig(row);

  let message = '';
  let advance = false;
  let nextPage = page;

  try {
    if (stage.startsWith('ref:')) {
      const refStage = stage.slice(4);
      const res = await adapter.fetchRefPage(cfg, refStage, page, refs);
      if (res.companies?.length) {
        for (const c of res.companies) {
          if (!c.name) continue;
          await supabaseAdmin.from('companies').upsert(
            {
              source_name: source,
              external_company_id: c.externalId,
              company_name: c.name,
              active_status: c.active ?? true,
            },
            { onConflict: 'source_name,external_company_id' },
          );
        }
      }
      message = `Loading ${refStage} (page ${page})`;
      if (!res.hasMore || page >= MAX_REF_PAGES) advance = true;
      else nextPage = page + 1;
    } else if (stage === 'tickets') {
      const res = await adapter.fetchTicketPage(cfg, page, { since });
      const normalized: NormalizedTicket[] = [];
      for (const t of res.tickets) {
        try {
          normalized.push(
            source === 'teamwork'
              ? normalizeTeamworkTask(t, cfg.baseUrl, refs)
              : normalizeDeskTicket(t, cfg.baseUrl, refs),
          );
        } catch (e) {
          errors.push({ stage: `ticket:${t.externalId}`, message: e instanceof Error ? e.message : String(e) });
        }
      }
      received += res.tickets.length;

      if (normalized.length > 0) {
        const externalIds = normalized.map((n) => n.external_ticket_id);
        const { data: existRows } = await supabaseAdmin
          .from('tickets')
          .select('external_ticket_id')
          .eq('source_system', source)
          .in('external_ticket_id', externalIds);
        const existing = new Set((existRows ?? []).map((r) => String(r.external_ticket_id)));

        const { error: upErr } = await supabaseAdmin
          .from('tickets')
          .upsert(normalized, { onConflict: 'source_system,external_ticket_id' });
        if (upErr) errors.push({ stage: 'upsert_batch', message: upErr.message });
        else {
          for (const n of normalized) {
            if (existing.has(n.external_ticket_id)) updated++;
            else created++;
          }
        }
      }
      message = `Tickets page ${page} — ${received} received`;
      if (!res.hasMore || page >= MAX_TICKET_PAGES) advance = true;
      else nextPage = page + 1;
    } else if (stage === 'timelogs') {
      const res = await adapter.fetchTimeLogPage(cfg, page, { since });
      if (res.entries.length > 0) {
        const { error: tlErr } = await supabaseAdmin.from('time_logs').upsert(
          res.entries.map((e) => ({
            source_name: source,
            external_entry_id: e.entryId,
            external_ticket_id: e.ticketId,
            hours: e.hours,
            logged_at: e.loggedAt,
          })),
          { onConflict: 'source_name,external_entry_id' },
        );
        if (tlErr) errors.push({ stage: 'time_logs', message: tlErr.message });
        else cursor.timeEntries = (cursor.timeEntries ?? 0) + res.entries.length;
      }
      message = `Time logs page ${page} — ${cursor.timeEntries ?? 0} entries`;
      if (!res.hasMore || page >= MAX_TIME_PAGES) advance = true;
      else nextPage = page + 1;
    } else if (stage === 'finalize') {
      const { data: appliedRows, error: applyErr } = await supabaseAdmin.rpc('apply_time_logs', {
        _source: source,
      });
      if (applyErr) errors.push({ stage: 'apply_time_logs', message: applyErr.message });
      else info.push({ stage: 'apply_time_logs', message: `tickets updated with logged time=${appliedRows ?? 0}` });

      try {
        const am = await autoMapAssignees(source);
        info.push({ stage: 'auto_map', message: `created=${am.created} ambiguous=${am.ambiguous} noMatch=${am.noMatch}` });
      } catch (e) {
        errors.push({ stage: 'auto_map', message: e instanceof Error ? e.message : String(e) });
      }

      const { data: recalcRows, error: recalcErr } = await supabaseAdmin.rpc('recalc_tickets', {
        _source: source,
      });
      if (recalcErr) errors.push({ stage: 'recalc', message: recalcErr.message });
      else {
        const r = Array.isArray(recalcRows) ? recalcRows[0] : recalcRows;
        info.push({ stage: 'recalc', message: `processed=${r?.processed ?? 0} unmapped=${r?.unmapped ?? 0}` });
      }

      const status = errors.length === 0 ? 'success' : received > 0 ? 'partial' : 'error';
      await supabaseAdmin
        .from('sync_runs')
        .update({
          stage: 'done',
          status,
          finished_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          progress_message: 'Finished',
          records_received: received,
          records_created: created,
          records_updated: updated,
          error_count: errors.length,
          error_details: [...errors, ...info].slice(0, 60),
          cursor: { ...cursor, refs: {}, errors, info },
        })
        .eq('id', runId);
      await supabaseAdmin
        .from('integration_connections')
        .update({ last_sync_at: new Date().toISOString(), status: status === 'error' ? 'error' : 'ok' })
        .eq('source_name', source);
      if (since) await bookkeepHistory(source, since);

      return { done: true, runId, stage: 'done', page, received, created, updated, errorCount: errors.length, status, message: 'Finished' };
    } else {
      // Unknown / done stage
      return { done: true, runId, stage, page, received, created, updated, errorCount: errors.length, status: run.status, message: 'Nothing to do' };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ stage, message: msg });
    // Reference stages are best-effort; ticket/time failures on the first page are fatal.
    if (stage.startsWith('ref:') || page > 1) {
      advance = true;
      message = `Skipped ${stage} after error`;
    } else {
      await failRun(runId, errors, info, stage, msg, { received, created, updated });
      return { done: true, runId, stage, page, received, created, updated, errorCount: errors.length, status: 'error', message: msg };
    }
  }

  const newStage = advance ? nextStage(source, stage) : stage;
  await supabaseAdmin
    .from('sync_runs')
    .update({
      stage: newStage ?? 'done',
      stage_page: advance ? 1 : nextPage,
      heartbeat_at: new Date().toISOString(),
      progress_message: message,
      records_received: received,
      records_created: created,
      records_updated: updated,
      error_count: errors.length,
      error_details: [...errors, ...info].slice(0, 60),
      cursor: { ...cursor, refs, errors, info },
    })
    .eq('id', runId);

  return {
    done: false,
    runId,
    stage: newStage ?? 'done',
    page: advance ? 1 : nextPage,
    received,
    created,
    updated,
    errorCount: errors.length,
    status: 'running',
    message,
  };
}

async function bookkeepHistory(source: SourceName, since: Date) {
  const { data: row } = await supabaseAdmin
    .from('integration_connections')
    .select('history_imported_through')
    .eq('source_name', source)
    .maybeSingle();
  const existing = row?.history_imported_through ? new Date(row.history_imported_through) : null;
  const earliest = existing && existing < since ? existing : since;
  await supabaseAdmin
    .from('integration_connections')
    .update({ history_imported_through: earliest.toISOString() })
    .eq('source_name', source);
}

async function failRun(
  runId: string,
  errors: Array<{ stage: string; message: string }>,
  info: Array<{ stage: string; message: string }>,
  stage: string,
  message: string,
  counts: { received?: number; created?: number; updated?: number } = {},
) {
  await supabaseAdmin
    .from('sync_runs')
    .update({
      status: 'error',
      stage: 'done',
      finished_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      progress_message: `Failed during ${stage}`,
      records_received: counts.received ?? 0,
      records_created: counts.created ?? 0,
      records_updated: counts.updated ?? 0,
      error_count: errors.length + 1,
      error_details: [...errors, { stage, message }, ...info].slice(0, 60),
    })
    .eq('id', runId);
}
