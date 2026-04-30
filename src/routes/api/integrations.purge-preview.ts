import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const QuerySchema = z.object({
  source_name: z.enum(['teamwork', 'teamwork_desk']),
  older_than_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export const Route = createFileRoute('/api/integrations/purge-preview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse({
          source_name: url.searchParams.get('source_name'),
          older_than_date: url.searchParams.get('older_than_date'),
        });
        if (!parsed.success) return jsonResponse({ error: 'Invalid query', issues: parsed.error.issues }, { status: 400 });

        const cutoff = new Date(parsed.data.older_than_date);
        if (isNaN(cutoff.getTime())) return jsonResponse({ error: 'Invalid older_than_date' }, { status: 400 });

        const { count, error } = await supabaseAdmin
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('source_system', parsed.data.source_name)
          .lt('updated_at_source', cutoff.toISOString());
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        return jsonResponse({ count: count ?? 0, cutoff: cutoff.toISOString() });
      },
    },
  },
});
