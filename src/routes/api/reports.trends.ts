import { createFileRoute } from '@tanstack/react-router';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { trends } from '@/server/services/reportService';
import { parseFilters } from '@/server/services/reportFilters';

export const Route = createFileRoute('/api/reports/trends')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const url = new URL(request.url);
        const granRaw = url.searchParams.get('granularity') ?? 'month';
        const granularity: 'day' | 'month' | 'year' =
          granRaw === 'day' || granRaw === 'year' ? granRaw : 'month';
        try {
          const data = await trends(parseFilters(url.searchParams), granularity);
          return jsonResponse(data);
        } catch (e) {
          return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
