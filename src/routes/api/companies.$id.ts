import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { pushCompanyToAirtable } from '@/server/services/airtableService';

const Body = z.object({
  account_type: z.string().max(255).nullable().optional(),
  monthly_included_hours: z.number().min(0).max(100000).optional(),
  care_plan_type: z.string().max(255).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
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

        // Best-effort push to Airtable if linked. Never fails the save.
        let airtable: { pushed: boolean; message?: string; error?: string } = { pushed: false };
        try {
          airtable = await pushCompanyToAirtable(params.id);
        } catch (e) {
          airtable = { pushed: false, error: e instanceof Error ? e.message : String(e) };
        }
        return jsonResponse({ ok: true, airtable });
      },
    },
  },
});
