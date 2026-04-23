import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

export const Route = createFileRoute('/api/integrations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }
        const { data, error } = await supabaseAdmin
          .from('integration_connections')
          .select('id,source_name,is_enabled,base_url,auth_type,last_tested_at,last_sync_at,status,notes,api_key_or_token,created_at,updated_at')
          .order('source_name');
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          (data ?? []).map((r) => ({
            ...r,
            has_token: !!r.api_key_or_token,
            api_key_or_token: undefined,
          })),
        );
      },
    },
  },
});
