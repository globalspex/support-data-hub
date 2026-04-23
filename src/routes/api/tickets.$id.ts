import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

export const Route = createFileRoute('/api/tickets/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }
        const { data, error } = await supabaseAdmin
          .from('tickets')
          .select('*')
          .eq('id', params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!data) return jsonResponse({ error: 'Not found' }, { status: 404 });
        return jsonResponse(data);
      },
    },
  },
});
