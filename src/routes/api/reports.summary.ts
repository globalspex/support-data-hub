import { createFileRoute } from '@tanstack/react-router';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { summary, type ReportFilters } from '@/server/services/reportService';
import { parseFilters } from '@/server/services/reportFilters';

export const Route = createFileRoute('/api/reports/summary')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const filters: ReportFilters = parseFilters(new URL(request.url).searchParams);
        try {
          const data = await summary(filters);
          return jsonResponse(data);
        } catch (e) {
          return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
