import { createFileRoute } from '@tanstack/react-router';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { recalculate } from '@/server/services/calcService';

export const Route = createFileRoute('/api/recalculate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const result = await recalculate({ kind: 'all' });
        return jsonResponse({ ok: true, ...result });
      },
    },
  },
});
