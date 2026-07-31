import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { startRun } from '@/server/services/syncService';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { SourceName } from '@/server/adapters/types';

const Body = z.object({ source_name: z.enum(['teamwork', 'teamwork_desk']).optional() });

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

          const runs: Array<{ source: SourceName; runId: string; stage: string }> = [];
          for (const src of sources) {
            const r = await startRun(src);
            runs.push({ source: src, runId: r.runId, stage: r.stage });
          }

          return jsonResponse({ ok: true, runs });
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
