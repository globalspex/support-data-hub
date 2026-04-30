import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const Body = z.object({
  source_name: z.enum(['teamwork', 'teamwork_desk']),
  older_than_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  confirm: z.literal('PURGE'),
});

export const Route = createFileRoute('/api/integrations/purge-old')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

        const cutoff = new Date(parsed.data.older_than_date);
        if (isNaN(cutoff.getTime())) return jsonResponse({ error: 'Invalid older_than_date' }, { status: 400 });

        // Count first (returned in response).
        const { count: beforeCount } = await supabaseAdmin
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('source_system', parsed.data.source_name)
          .lt('updated_at_source', cutoff.toISOString());

        const { error } = await supabaseAdmin
          .from('tickets')
          .delete()
          .eq('source_system', parsed.data.source_name)
          .lt('updated_at_source', cutoff.toISOString());
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        return jsonResponse({ ok: true, deleted: beforeCount ?? 0, cutoff: cutoff.toISOString() });
      },
    },
  },
});
