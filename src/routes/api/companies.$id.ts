import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const Body = z.object({
  account_type: z.string().max(255).nullable().optional(),
  monthly_included_hours: z.number().min(0).max(100000).optional(),
  care_plan_type: z.string().max(255).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active_status: z.boolean().optional(),
  company_name: z.string().min(1).max(255).optional(),
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
      DELETE: async ({ request, params }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        // Look up the company to find its name (tickets are linked by name, not id)
        const { data: company, error: lookupErr } = await supabaseAdmin
          .from('companies')
          .select('company_name')
          .eq('id', params.id)
          .maybeSingle();
        if (lookupErr) return jsonResponse({ error: lookupErr.message }, { status: 500 });
        if (!company) return jsonResponse({ error: 'Not found' }, { status: 404 });

        if (company.company_name) {
          const { count, error: countErr } = await supabaseAdmin
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('company_name', company.company_name);
          if (countErr) return jsonResponse({ error: countErr.message }, { status: 500 });
          if ((count ?? 0) > 0) {
            return jsonResponse(
              { error: `Cannot delete: ${count} ticket(s) reference this company. Deactivate instead.` },
              { status: 409 },
            );
          }
        }

        const { error } = await supabaseAdmin.from('companies').delete().eq('id', params.id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
