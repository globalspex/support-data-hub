import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { recalculate } from '@/server/services/calcService';

const Body = z.object({
  items: z.array(z.object({
    source_name: z.enum(['teamwork', 'teamwork_desk']),
    raw_assigned_name: z.string().max(255).nullable().optional(),
    raw_assigned_id: z.string().max(255).nullable().optional(),
    team_member_id: z.string().uuid(),
  })).min(1).max(500),
});

export const Route = createFileRoute('/api/assigned-mappings/bulk')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

        const rows = parsed.data.items.map((i) => ({
          source_name: i.source_name,
          raw_assigned_name: i.raw_assigned_name ?? null,
          raw_assigned_id: i.raw_assigned_id ?? null,
          team_member_id: i.team_member_id,
        }));

        const { error } = await supabaseAdmin.from('assigned_name_mappings').insert(rows);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        await recalculate({ kind: 'all' });
        return jsonResponse({ ok: true, created: rows.length });
      },
    },
  },
});
