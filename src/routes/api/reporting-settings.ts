import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { recalculate } from '@/server/services/calcService';

const Body = z.object({
  reportable_time_mode: z.enum(['actual_only', 'tag_only', 'greater_of_actual_or_tag', 'actual_plus_tag']).optional(),
  default_date_range: z.string().max(64).optional(),
});

export const Route = createFileRoute('/api/reporting-settings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const { data, error } = await supabaseAdmin
          .from('reporting_settings')
          .select('*')
          .limit(1)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data);
      },
      PUT: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

        const { data: existing } = await supabaseAdmin
          .from('reporting_settings')
          .select('id')
          .limit(1)
          .maybeSingle();

        if (existing) {
          const { error } = await supabaseAdmin
            .from('reporting_settings')
            .update(parsed.data)
            .eq('id', existing.id);
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
        } else {
          const { error } = await supabaseAdmin
            .from('reporting_settings')
            .insert(parsed.data);
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
        }

        if (parsed.data.reportable_time_mode) {
          await recalculate({ kind: 'all' });
        }
        return jsonResponse({ ok: true });
      },
    },
  },
});
