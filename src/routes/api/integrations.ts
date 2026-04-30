import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const SaveBody = z.object({
  source_name: z.enum(['teamwork', 'teamwork_desk']),
  base_url: z.string().url().max(500),
  api_key_or_token: z.string().min(1).max(2000).optional(),
  is_enabled: z.boolean(),
  notes: z.string().max(1000).nullable().optional(),
  sync_window_days: z.number().int().min(1).max(3650).optional(),
});

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
          .select('id,source_name,is_enabled,base_url,auth_type,last_tested_at,last_sync_at,status,notes,api_key_or_token,sync_window_days,history_imported_through,created_at,updated_at')
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
      POST: async ({ request }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }
        const body = await request.json().catch(() => ({}));
        const parsed = SaveBody.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
        }
        const update: {
          base_url: string;
          is_enabled: boolean;
          notes: string | null;
          api_key_or_token?: string;
          sync_window_days?: number;
        } = {
          base_url: parsed.data.base_url,
          is_enabled: parsed.data.is_enabled,
          notes: parsed.data.notes ?? null,
        };
        if (parsed.data.api_key_or_token) {
          update.api_key_or_token = parsed.data.api_key_or_token.trim();
        }
        if (parsed.data.sync_window_days !== undefined) {
          update.sync_window_days = parsed.data.sync_window_days;
        }
        const { error } = await supabaseAdmin
          .from('integration_connections')
          .update(update)
          .eq('source_name', parsed.data.source_name);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
