import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const Body = z.object({
  name: z.string().min(1).max(255),
  role: z.string().max(255).nullable().optional(),
  department: z.string().max(255).nullable().optional(),
  hourly_cost_rate: z.number().min(0).max(10000),
  billable_rate: z.number().min(0).max(10000),
  active_status: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute('/api/team-members')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const { data, error } = await supabaseAdmin
          .from('team_members')
          .select('*')
          .order('name');
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
        const { data, error } = await supabaseAdmin
          .from('team_members')
          .insert(parsed.data)
          .select()
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data);
      },
    },
  },
});
