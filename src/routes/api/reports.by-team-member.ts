import { createFileRoute } from '@tanstack/react-router';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { byTeamMember } from '@/server/services/reportService';
import { parseFilters } from '@/server/services/reportFilters';

export const Route = createFileRoute('/api/reports/by-team-member')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        try {
          const data = await byTeamMember(parseFilters(new URL(request.url).searchParams));
          return jsonResponse(data);
        } catch (e) {
          return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
