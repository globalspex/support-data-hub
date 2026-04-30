import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { runSync, createSyncRun } from '@/server/services/syncService';

const Body = z.object({
  source_name: z.enum(['teamwork', 'teamwork_desk']),
  from_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export const Route = createFileRoute('/api/integrations/import-history')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

        const since = new Date(parsed.data.from_date);
        if (isNaN(since.getTime())) return jsonResponse({ error: 'Invalid from_date' }, { status: 400 });

        try {
          const runId = await createSyncRun(parsed.data.source_name);

          // Fire and forget — long history imports can exceed gateway timeouts.
          void runSync(parsed.data.source_name, { sinceOverride: since }, runId)
            .then(async () => {
              const { data: row } = await supabaseAdmin
                .from('integration_connections')
                .select('history_imported_through')
                .eq('source_name', parsed.data.source_name)
                .maybeSingle();
              const existing = row?.history_imported_through ? new Date(row.history_imported_through) : null;
              const earliest = existing && existing < since ? existing : since;
              await supabaseAdmin
                .from('integration_connections')
                .update({ history_imported_through: earliest.toISOString() })
                .eq('source_name', parsed.data.source_name);
            })
            .catch(async (e) => {
              const message = e instanceof Error ? e.message : String(e);
              await supabaseAdmin
                .from('sync_runs')
                .update({
                  finished_at: new Date().toISOString(),
                  status: 'error',
                  error_count: 1,
                  error_details: [{ stage: 'background', message }],
                })
                .eq('id', runId);
            });

          return jsonResponse({ ok: true, queued: true, runId, since: since.toISOString() });
        } catch (e) {
          return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
