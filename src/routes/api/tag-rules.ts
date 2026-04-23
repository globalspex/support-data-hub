import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { recalculate } from '@/server/services/calcService';

const Body = z.object({
  tag_name: z.string().min(1).max(255),
  hours_value: z.number().min(0).max(1000),
  active_status: z.boolean().optional(),
  stacking_priority: z.number().int().min(0).max(1000).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute('/api/tag-rules')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const { data, error } = await supabaseAdmin
          .from('tag_time_rules')
          .select('*')
          .order('stacking_priority', { ascending: false })
          .order('tag_name');
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(data ?? []);
      },
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
        const { data, error } = await supabaseAdmin
          .from('tag_time_rules')
          .insert(parsed.data)
          .select()
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        await recalculate({ kind: 'all' });
        return jsonResponse(data);
      },
    },
  },
});
