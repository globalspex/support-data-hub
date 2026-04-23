import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { runSync, runSyncAllEnabled } from '@/server/services/syncService';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

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
          if (parsed.data.source_name) {
            const r = await runSync(parsed.data.source_name);
            return jsonResponse({ ok: true, results: [{ source: parsed.data.source_name, ...r }] });
          }
          const results = await runSyncAllEnabled();
          return jsonResponse({ ok: true, results });
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
