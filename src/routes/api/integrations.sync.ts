import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { runSync, createSyncRun, getIntegration } from '@/server/services/syncService';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { SourceName } from '@/server/adapters/types';

const Body = z.object({ source_name: z.enum(['teamwork', 'teamwork_desk']).optional() });

/**
 * Fire-and-forget runner. Marks the sync_runs row as error if it throws.
 * Not awaited by the HTTP handler so the response can return immediately —
 * this dodges Cloudflare's gateway timeout (504) for long syncs.
 */
function startBackgroundSync(source: SourceName, runId: string) {
  void runSync(source, {}, runId).catch(async (e) => {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await supabaseAdmin
        .from('sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'error',
          error_count: 1,
          error_details: [{ stage: 'background', message }],
        })
        .eq('id', runId);
    } catch {
      /* noop */
    }
  });
}

export const Route = createFileRoute('/api/integrations/sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body' }, { status: 400 });

        try {
          const sources: SourceName[] = parsed.data.source_name
            ? [parsed.data.source_name]
            : ((
                await supabaseAdmin
                  .from('integration_connections')
                  .select('source_name')
                  .eq('is_enabled', true)
              ).data ?? []).map((r) => r.source_name as SourceName);

          // Validate sources are configured before queuing
          const queued: Array<{ source: SourceName; runId: string }> = [];
          for (const src of sources) {
            const row = await getIntegration(src);
            if (!row || !row.is_enabled || !row.base_url || !row.api_key_or_token) {
              return jsonResponse(
                { ok: false, error: `Integration "${src}" is not configured/enabled.` },
                { status: 400 },
              );
            }
            const runId = await createSyncRun(src);
            queued.push({ source: src, runId });
          }

          // Kick off after the response: each call is unawaited.
          for (const q of queued) startBackgroundSync(q.source, q.runId);

          return jsonResponse({
            ok: true,
            queued: true,
            results: queued.map((q) => ({ source: q.source, runId: q.runId, status: 'running' })),
          });
        } catch (e) {
          return jsonResponse(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
