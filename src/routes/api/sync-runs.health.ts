import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

type ErrorEntry = { stage?: string; message?: string };

interface SyncRunRow {
  id: string;
  source_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_received: number | null;
  records_created: number | null;
  records_updated: number | null;
  error_count: number | null;
  error_details: ErrorEntry[] | null;
}

/**
 * GET /api/sync-runs/health?source_name=&limit=20
 *
 * Aggregates recent sync runs into a health report so we can tell whether a
 * failure is a real adapter problem (e.g. tickets endpoint broken) or just an
 * unrelated stage failure (e.g. companies endpoint flaky) while tickets still
 * synced fine.
 */
export const Route = createFileRoute('/api/sync-runs/health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }

        const url = new URL(request.url);
        const sourceName = url.searchParams.get('source_name');
        const limitParam = Number(url.searchParams.get('limit') ?? 20);
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

        let query = supabaseAdmin
          .from('sync_runs')
          .select('id,source_name,status,started_at,finished_at,records_received,records_created,records_updated,error_count,error_details')
          .order('started_at', { ascending: false })
          .limit(limit);
        if (sourceName) query = query.eq('source_name', sourceName);

        const { data, error } = await query;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const runs = (data ?? []) as SyncRunRow[];

        // Group per source
        const bySource: Record<string, SyncRunRow[]> = {};
        for (const r of runs) {
          (bySource[r.source_name] ||= []).push(r);
        }

        const report = Object.entries(bySource).map(([source, rows]) => {
          const totals = rows.reduce(
            (acc, r) => {
              acc.received += r.records_received ?? 0;
              acc.created += r.records_created ?? 0;
              acc.updated += r.records_updated ?? 0;
              acc.errors += r.error_count ?? 0;
              acc.runs += 1;
              if (r.status === 'success') acc.successRuns += 1;
              else if (r.status === 'partial') acc.partialRuns += 1;
              else if (r.status === 'error') acc.errorRuns += 1;
              else if (r.status === 'running') acc.runningRuns += 1;
              return acc;
            },
            { received: 0, created: 0, updated: 0, errors: 0, runs: 0, successRuns: 0, partialRuns: 0, errorRuns: 0, runningRuns: 0 },
          );

          // Aggregate error stages across runs
          const stageCounts: Record<string, { count: number; lastMessage: string; lastSeenAt: string }> = {};
          for (const r of rows) {
            for (const e of r.error_details ?? []) {
              const stage = (e.stage ?? 'unknown').split(':')[0]; // collapse "ticket:1234" -> "ticket"
              if (stage === 'window' || stage === 'auto_map') continue; // info entries, not errors
              const existing = stageCounts[stage];
              if (!existing) {
                stageCounts[stage] = { count: 1, lastMessage: e.message ?? '', lastSeenAt: r.started_at };
              } else {
                existing.count += 1;
                if (new Date(r.started_at) >= new Date(existing.lastSeenAt)) {
                  existing.lastMessage = e.message ?? existing.lastMessage;
                  existing.lastSeenAt = r.started_at;
                }
              }
            }
          }

          const topErrorStages = Object.entries(stageCounts)
            .map(([stage, v]) => ({ stage, ...v }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

          const last = rows[0];
          // Heuristic: adapter is "healthy" if the latest run upserted tickets,
          // even if some non-ticket stages errored.
          const adapterHealthy =
            last.status === 'success' ||
            (last.status === 'partial' && (last.records_received ?? 0) > 0);

          return {
            source,
            totals,
            lastRun: last
              ? {
                  id: last.id,
                  status: last.status,
                  started_at: last.started_at,
                  finished_at: last.finished_at,
                  records_received: last.records_received ?? 0,
                  records_created: last.records_created ?? 0,
                  records_updated: last.records_updated ?? 0,
                  error_count: last.error_count ?? 0,
                }
              : null,
            adapterHealthy,
            topErrorStages,
          };
        });

        return jsonResponse({
          generated_at: new Date().toISOString(),
          window_runs: limit,
          sources: report,
        });
      },
    },
  },
});
