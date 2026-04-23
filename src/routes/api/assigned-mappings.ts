import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';
import { recalculate } from '@/server/services/calcService';

const Body = z.object({
  source_name: z.enum(['teamwork', 'teamwork_desk']),
  raw_assigned_name: z.string().max(255).nullable().optional(),
  raw_assigned_id: z.string().max(255).nullable().optional(),
  team_member_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const Route = createFileRoute('/api/assigned-mappings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const url = new URL(request.url);
        const includeUnmapped = url.searchParams.get('include_unmapped') === '1';

        const { data: mappings, error } = await supabaseAdmin
          .from('assigned_name_mappings')
          .select('*')
          .order('source_name')
          .order('raw_assigned_name');
        if (error) return jsonResponse({ error: error.message }, { status: 500 });

        // Pull team member names for display
        const memberIds = Array.from(new Set((mappings ?? []).map((m) => m.team_member_id).filter(Boolean))) as string[];
        const memberMap = new Map<string, string>();
        if (memberIds.length > 0) {
          const { data: tm } = await supabaseAdmin
            .from('team_members')
            .select('id,name')
            .in('id', memberIds);
          for (const m of tm ?? []) memberMap.set(m.id, m.name);
        }

        const enriched = (mappings ?? []).map((m) => ({
          ...m,
          team_member_name: m.team_member_id ? (memberMap.get(m.team_member_id) ?? null) : null,
        }));

        if (!includeUnmapped) return jsonResponse(enriched);

        // Find raw assignees from tickets that have NO mapping row yet
        const { data: assignees } = await supabaseAdmin
          .from('tickets')
          .select('source_system,assigned_name_raw,assigned_external_id')
          .not('assigned_name_raw', 'is', null);

        const seen = new Set<string>();
        for (const m of mappings ?? []) {
          if (m.raw_assigned_id) seen.add(`${m.source_name}::id::${m.raw_assigned_id}`);
          if (m.raw_assigned_name) seen.add(`${m.source_name}::name::${m.raw_assigned_name}`);
        }
        const unmapped: Array<{ source_name: string; raw_assigned_name: string | null; raw_assigned_id: string | null; ticket_count: number }> = [];
        const counter = new Map<string, { source_name: string; raw_assigned_name: string | null; raw_assigned_id: string | null; ticket_count: number }>();
        for (const a of assignees ?? []) {
          const idKey = a.assigned_external_id ? `${a.source_system}::id::${a.assigned_external_id}` : null;
          const nameKey = a.assigned_name_raw ? `${a.source_system}::name::${a.assigned_name_raw}` : null;
          const isMapped = (idKey && seen.has(idKey)) || (nameKey && seen.has(nameKey));
          if (isMapped) continue;
          const dedupKey = idKey ?? nameKey ?? `${a.source_system}::?`;
          const existing = counter.get(dedupKey);
          if (existing) existing.ticket_count++;
          else counter.set(dedupKey, {
            source_name: a.source_system,
            raw_assigned_name: a.assigned_name_raw,
            raw_assigned_id: a.assigned_external_id,
            ticket_count: 1,
          });
        }
        for (const v of counter.values()) unmapped.push(v);
        unmapped.sort((a, b) => b.ticket_count - a.ticket_count);

        return jsonResponse({ mapped: enriched, unmapped });
      },
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
        const { data, error } = await supabaseAdmin
          .from('assigned_name_mappings')
          .insert(parsed.data)
          .select()
          .single();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        await recalculate({
          kind: 'mapping',
          source: parsed.data.source_name,
          rawId: parsed.data.raw_assigned_id ?? null,
          rawName: parsed.data.raw_assigned_name ?? null,
        });
        return jsonResponse(data);
      },
    },
  },
});
