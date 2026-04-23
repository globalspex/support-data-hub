import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { recalculate } from '@/server/services/calcService';

const Body = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.string().max(255).nullable().optional(),
  department: z.string().max(255).nullable().optional(),
  hourly_cost_rate: z.number().min(0).max(10000).optional(),
  billable_rate: z.number().min(0).max(10000).optional(),
  active_status: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute('/api/team-members/$id')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

        const ratesChanged =
          parsed.data.hourly_cost_rate !== undefined ||
          parsed.data.billable_rate !== undefined;

        const { error } = await supabaseAdmin
          .from('team_members')
          .update(parsed.data)
          .eq('id', params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        if (ratesChanged) {
          await recalculate({ kind: 'team_member', teamMemberId: params.id });
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
