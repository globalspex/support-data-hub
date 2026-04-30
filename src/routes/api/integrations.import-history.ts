import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { createSyncRun, getIntegration } from '@/server/services/syncService';

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
          const row = await getIntegration(parsed.data.source_name);
          if (!row || !row.is_enabled || !row.base_url || !row.api_key_or_token) {
            return jsonResponse({ ok: false, error: 'Integration is not configured/enabled.' }, { status: 400 });
          }

          const runId = await createSyncRun(parsed.data.source_name);

          const origin = new URL(request.url).origin;
          const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (token) {
            void fetch(`${origin}/api/internal/run-sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                source_name: parsed.data.source_name,
                run_id: runId,
                since: since.toISOString(),
                token,
              }),
            }).catch(() => {});
          }

          return jsonResponse({ ok: true, queued: true, runId, since: since.toISOString() });
        } catch (e) {
          return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
