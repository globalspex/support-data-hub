import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const CreateBody = z.object({
  company_name: z.string().min(1).max(255),
  account_type: z.string().max(255).nullable().optional(),
  monthly_included_hours: z.number().min(0).max(100000).optional(),
  care_plan_type: z.string().max(255).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active_status: z.boolean().optional(),
});

export const Route = createFileRoute('/api/companies')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const { data, error } = await supabaseAdmin
          .from('companies')
          .select('*')
          .order('company_name');
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = CreateBody.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
        const { data, error } = await supabaseAdmin
          .from('companies')
          .insert({
            source_name: 'manual',
            company_name: parsed.data.company_name,
            account_type: parsed.data.account_type ?? null,
            monthly_included_hours: parsed.data.monthly_included_hours ?? 0,
            care_plan_type: parsed.data.care_plan_type ?? null,
            website: parsed.data.website ?? null,
            notes: parsed.data.notes ?? null,
            active_status: parsed.data.active_status ?? true,
          })
          .select('*')
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data, { status: 201 });
      },
    },
  },
});
