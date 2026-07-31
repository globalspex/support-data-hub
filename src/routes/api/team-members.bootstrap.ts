import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { recalculate } from '@/server/services/calcService';

const Body = z.object({ source_name: z.enum(['teamwork', 'teamwork_desk']).optional() });

/**
 * Creates team members for every assignee name found on synced tickets and
 * links those raw names to them, then recalculates so labor cost / billable
 * value stop being zero. Rates stay at their defaults until edited.
 */
export const Route = createFileRoute('/api/team-members/bootstrap')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body' }, { status: 400 });

        const { data, error } = await supabaseAdmin.rpc('bootstrap_team_members', {
          _source: parsed.data.source_name ?? undefined,
        });
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        const row = Array.isArray(data) ? data[0] : data;
        const recalc = await recalculate({ kind: 'all' });
        return jsonResponse({
          ok: true,
          members_created: Number(row?.members_created ?? 0),
          mappings_created: Number(row?.mappings_created ?? 0),
          ...recalc,
        });
      },
    },
  },
});
