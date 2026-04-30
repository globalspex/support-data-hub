import { createFileRoute } from '@tanstack/react-router';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { autoMapAssignees } from '@/server/services/autoMapService';
import { recalculate } from '@/server/services/calcService';

export const Route = createFileRoute('/api/assigned-mappings/auto-map')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        try {
          const result = await autoMapAssignees();
          if (result.created > 0) {
            await recalculate({ kind: 'all' });
          }
          return jsonResponse({ ok: true, ...result });
        } catch (e) {
          return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
