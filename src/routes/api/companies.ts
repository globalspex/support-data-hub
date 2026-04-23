import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

export const Route = createFileRoute('/api/companies')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }
        const { data, error } = await supabaseAdmin
          .from('companies')
          .select('*')
          .order('company_name');
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
    },
  },
});
