import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { createSyncRun, getIntegration } from '@/server/services/syncService';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { SourceName } from '@/server/adapters/types';

const Body = z.object({ source_name: z.enum(['teamwork', 'teamwork_desk']).optional() });

/**
 * Kick off a sync in a separate Worker invocation by self-fetching the
 * internal runner endpoint and abandoning the response. This gives the long
 * sync its own time/CPU budget and lets us return to the client immediately,
 * avoiding the Cloudflare gateway 504.
 */
function dispatchInternalRun(origin: string, payload: {
  source_name: SourceName;
  run_id: string;
  since?: string;
  full_history?: boolean;
}) {
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) return;
  // Fire and forget: do NOT await. The fetch is dispatched immediately.
  void fetch(`${origin}/api/internal/run-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, token }),
  }).catch(() => {});
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

        const origin = new URL(request.url).origin;

        try {
          const sources: SourceName[] = parsed.data.source_name
            ? [parsed.data.source_name]
            : ((
                await supabaseAdmin
                  .from('integration_connections')
                  .select('source_name')
                  .eq('is_enabled', true)
              ).data ?? []).map((r) => r.source_name as SourceName);

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

          for (const q of queued) {
            dispatchInternalRun(origin, { source_name: q.source, run_id: q.runId });
          }

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
