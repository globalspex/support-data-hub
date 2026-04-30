import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { runSync } from '@/server/services/syncService';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { jsonResponse } from '@/server/services/apiAuth';
import type { SourceName } from '@/server/adapters/types';

const Body = z.object({
  source_name: z.enum(['teamwork', 'teamwork_desk']),
  run_id: z.string().uuid(),
  since: z.string().datetime().optional(),
  full_history: z.boolean().optional(),
  token: z.string(),
});

/**
 * Internal worker endpoint. Performs an actual sync run.
 * Authenticated by a shared internal token (the service role key) so only
 * server-to-server callers within this project can hit it.
 *
 * The user-facing /api/integrations/sync endpoint kicks this off via a
 * self-fetch and returns immediately, so the long sync work runs in its own
 * Cloudflare Worker invocation with its own time budget — avoiding the
 * gateway 504 the user saw on long Teamwork syncs.
 */
export const Route = createFileRoute('/api/internal/run-sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body' }, { status: 400 });

        const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!expected || parsed.data.token !== expected) {
          return jsonResponse({ error: 'Forbidden' }, { status: 403 });
        }

        const { source_name, run_id, since, full_history } = parsed.data;
        try {
          await runSync(
            source_name as SourceName,
            {
              sinceOverride: since ? new Date(since) : undefined,
              fullHistory: full_history,
            },
            run_id,
          );
          return jsonResponse({ ok: true });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          await supabaseAdmin
            .from('sync_runs')
            .update({
              finished_at: new Date().toISOString(),
              status: 'error',
              error_count: 1,
              error_details: [{ stage: 'background', message }],
            })
            .eq('id', run_id);
          return jsonResponse({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
