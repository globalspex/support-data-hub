import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { startRun } from '@/server/services/syncService';

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
          const r = await startRun(parsed.data.source_name, { since, syncType: 'history' });
          return jsonResponse({ ok: true, runId: r.runId, stage: r.stage, since: r.since });
        } catch (e) {
          return jsonResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
