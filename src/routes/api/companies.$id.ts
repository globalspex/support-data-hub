import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const Body = z.object({
  account_type: z.string().max(255).nullable().optional(),
  monthly_included_hours: z.number().min(0).max(100000).optional(),
  care_plan_type: z.string().max(255).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active_status: z.boolean().optional(),
});

export const Route = createFileRoute('/api/companies/$id')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
        const { error } = await supabaseAdmin
          .from('companies')
          .update(parsed.data)
          .eq('id', params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
