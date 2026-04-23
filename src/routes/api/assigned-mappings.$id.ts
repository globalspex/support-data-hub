import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { recalculate } from '@/server/services/calcService';

const Body = z.object({
  team_member_id: z.string().uuid().nullable().optional(),
  raw_assigned_name: z.string().max(255).nullable().optional(),
  raw_assigned_id: z.string().max(255).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute('/api/assigned-mappings/$id')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
        const { data: row, error } = await supabaseAdmin
          .from('assigned_name_mappings')
          .update(parsed.data)
          .eq('id', params.id)
          .select()
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (row) {
          await recalculate({
            kind: 'mapping',
            source: row.source_name,
            rawId: row.raw_assigned_id,
            rawName: row.raw_assigned_name,
          });
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
