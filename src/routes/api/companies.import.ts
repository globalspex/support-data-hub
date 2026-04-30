import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { requireAdminFromRequest, jsonResponse } from '@/server/services/apiAuth';

const RowSchema = z.object({
  company_name: z.string().min(1),
  website: z.string().nullable().optional(),
  care_plan_type: z.string().nullable().optional(),
  active_status: z.boolean(),
});

const Body = z.object({
  rows: z.array(RowSchema).max(5000),
  confirm: z.boolean().optional(),
  createMissing: z.boolean().optional(),
});

interface DiffEntry {
  csv: z.infer<typeof RowSchema>;
  matchedId: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  status: 'update' | 'no_change' | 'create' | 'unmatched';
}

function norm(s: string | null | undefined) {
  return (s ?? '').toLowerCase().trim();
}

export const Route = createFileRoute('/api/companies/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await requireAdminFromRequest(request); } catch (r) { return r as Response; }
        const body = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
        }
        const { rows, confirm, createMissing } = parsed.data;

        const { data: existing, error: exErr } = await supabaseAdmin
          .from('companies')
          .select('id, company_name, website, care_plan_type, active_status');
        if (exErr) return jsonResponse({ error: exErr.message }, { status: 500 });

        const byName = new Map<string, typeof existing[number]>();
        for (const r of existing ?? []) {
          if (r.company_name) byName.set(norm(r.company_name), r);
        }

        const diff: DiffEntry[] = [];
        for (const row of rows) {
          const match = byName.get(norm(row.company_name));
          if (!match) {
            diff.push({ csv: row, matchedId: null, changes: {}, status: createMissing ? 'create' : 'unmatched' });
            continue;
          }
          const changes: DiffEntry['changes'] = {};
          if (row.website !== undefined && (row.website ?? null) !== (match.website ?? null)) {
            changes.website = { from: match.website, to: row.website };
          }
          if (row.care_plan_type !== undefined && (row.care_plan_type ?? null) !== (match.care_plan_type ?? null)) {
            changes.care_plan_type = { from: match.care_plan_type, to: row.care_plan_type };
          }
          if (row.active_status !== (match.active_status ?? true)) {
            changes.active_status = { from: match.active_status, to: row.active_status };
          }
          diff.push({
            csv: row,
            matchedId: match.id,
            changes,
            status: Object.keys(changes).length > 0 ? 'update' : 'no_change',
          });
        }

        const summary = {
          total: diff.length,
          toUpdate: diff.filter((d) => d.status === 'update').length,
          unchanged: diff.filter((d) => d.status === 'no_change').length,
          unmatched: diff.filter((d) => d.status === 'unmatched').length,
          toCreate: diff.filter((d) => d.status === 'create').length,
        };

        if (!confirm) {
          return jsonResponse({ ok: true, dryRun: true, summary, diff });
        }

        // Apply
        const { data: run, error: runErr } = await supabaseAdmin
          .from('sync_runs')
          .insert({ source_name: 'csv_import', sync_type: 'manual', status: 'running' })
          .select('id')
          .single();
        if (runErr || !run) return jsonResponse({ error: runErr?.message ?? 'Failed to log run' }, { status: 500 });

        let created = 0;
        let updated = 0;
        const errors: Array<{ company: string; message: string }> = [];

        for (const entry of diff) {
          try {
            if (entry.status === 'update' && entry.matchedId) {
              const patch: { website?: string | null; care_plan_type?: string | null; active_status?: boolean } = {};
              if ('website' in entry.changes) patch.website = entry.changes.website.to as string | null;
              if ('care_plan_type' in entry.changes) patch.care_plan_type = entry.changes.care_plan_type.to as string | null;
              if ('active_status' in entry.changes) patch.active_status = entry.changes.active_status.to as boolean;
              const { error } = await supabaseAdmin.from('companies').update(patch).eq('id', entry.matchedId);
              if (error) throw new Error(error.message);
              updated++;
            } else if (entry.status === 'create') {
              const { error } = await supabaseAdmin.from('companies').insert({
                source_name: 'csv_import',
                company_name: entry.csv.company_name,
                website: entry.csv.website ?? null,
                care_plan_type: entry.csv.care_plan_type ?? null,
                active_status: entry.csv.active_status,
              });
              if (error) throw new Error(error.message);
              created++;
            }
          } catch (e) {
            errors.push({ company: entry.csv.company_name, message: e instanceof Error ? e.message : String(e) });
          }
        }

        await supabaseAdmin.from('sync_runs').update({
          records_received: diff.length,
          records_created: created,
          records_updated: updated,
          error_count: errors.length,
          error_details: errors.length ? errors.map((e) => ({ stage: `row:${e.company}`, message: e.message })) : null,
          status: errors.length === 0 ? 'success' : (created + updated > 0 ? 'partial' : 'error'),
          finished_at: new Date().toISOString(),
        }).eq('id', run.id);

        return jsonResponse({ ok: true, applied: true, summary: { ...summary, created, updated, errors: errors.length } });
      },
    },
  },
});
