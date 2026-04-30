import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

export const Route = createFileRoute('/api/tickets')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminFromRequest(request);
        } catch (r) {
          return r as Response;
        }
        const url = new URL(request.url);
        const p = url.searchParams;
        const limit = Math.min(Number(p.get('limit')) || 200, 500);
        let q = supabaseAdmin
          .from('tickets')
          .select(
            'id,source_system,external_ticket_id,company_name,ticket_title,status,type,assigned_name_raw,assigned_team_member_id,customer_name,inbox,tags,ticket_url,created_at_source,updated_at_source,closed_at_source,actual_logged_time,calculated_tag_time,final_reportable_time,labor_cost,billable_value',
          )
          .order('created_at_source', { ascending: false, nullsFirst: false })
          .limit(limit);

        const set = (k: string, fn: (v: string) => void) => {
          const v = p.get(k);
          if (v) fn(v);
        };
        set('source_system', (v) => { q = q.eq('source_system', v); });
        set('company_name', (v) => { q = q.ilike('company_name', `%${v}%`); });
        set('assigned_name_raw', (v) => { q = q.ilike('assigned_name_raw', `%${v}%`); });
        set('status', (v) => {
          const list = v.split(',').map((s) => s.trim()).filter(Boolean);
          if (list.length === 1) q = q.eq('status', list[0]);
          else if (list.length > 1) q = q.in('status', list);
        });
        set('type', (v) => { q = q.eq('type', v); });
        set('inbox', (v) => { q = q.eq('inbox', v); });
        set('tag', (v) => { q = q.contains('tags', [v]); });
        set('date_from', (v) => { q = q.gte('created_at_source', v); });
        set('date_to', (v) => { q = q.lte('created_at_source', v); });

        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
    },
  },
});
