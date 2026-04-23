import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

export const Route = createFileRoute('/api/sync-runs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }
        const { data, error } = await supabaseAdmin
          .from('sync_runs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(100);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
    },
  },
});
