import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { SourceName } from '../adapters/types';

const norm = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

interface ExistingKey {
  source_name: string;
  raw_assigned_id: string | null;
  raw_assigned_name: string | null;
}

/**
 * Auto-create assigned_name_mappings rows for raw assignees whose normalized
 * name matches exactly one active team member. Never overwrites existing
 * mappings. Returns counts; does NOT call recalculate (caller should).
 */
export async function autoMapAssignees(
  source?: SourceName,
): Promise<{ created: number; ambiguous: number; noMatch: number; skippedExisting: number }> {
  // Active team members, normalized name -> array of ids
  const { data: members, error: memErr } = await supabaseAdmin
    .from('team_members')
    .select('id,name,active_status')
    .eq('active_status', true);
  if (memErr) throw new Error(memErr.message);

  const nameToIds = new Map<string, string[]>();
  for (const m of members ?? []) {
    const k = norm(m.name);
    if (!k) continue;
    const arr = nameToIds.get(k) ?? [];
    arr.push(m.id);
    nameToIds.set(k, arr);
  }

  // Existing mappings — index by source+id and source+name
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('assigned_name_mappings')
    .select('source_name,raw_assigned_id,raw_assigned_name');
  if (exErr) throw new Error(exErr.message);
  const seen = new Set<string>();
  for (const r of (existing ?? []) as ExistingKey[]) {
    if (r.raw_assigned_id) seen.add(`${r.source_name}::id::${r.raw_assigned_id}`);
    if (r.raw_assigned_name) seen.add(`${r.source_name}::name::${r.raw_assigned_name}`);
  }

  // Distinct raw assignees from tickets
  let q = supabaseAdmin
    .from('tickets')
    .select('source_system,assigned_name_raw,assigned_external_id')
    .not('assigned_name_raw', 'is', null);
  if (source) q = q.eq('source_system', source);
  const { data: assignees, error: aErr } = await q;
  if (aErr) throw new Error(aErr.message);

  const distinct = new Map<string, { source_name: string; raw_assigned_name: string | null; raw_assigned_id: string | null }>();
  for (const a of assignees ?? []) {
    const key = `${a.source_system}::${a.assigned_external_id ?? 'no-id'}::${a.assigned_name_raw ?? ''}`;
    if (!distinct.has(key)) {
      distinct.set(key, {
        source_name: a.source_system,
        raw_assigned_name: a.assigned_name_raw,
        raw_assigned_id: a.assigned_external_id,
      });
    }
  }

  let created = 0;
  let ambiguous = 0;
  let noMatch = 0;
  let skippedExisting = 0;
  const toInsert: Array<{
    source_name: string;
    raw_assigned_name: string | null;
    raw_assigned_id: string | null;
    team_member_id: string;
  }> = [];

  for (const d of distinct.values()) {
    const idKey = d.raw_assigned_id ? `${d.source_name}::id::${d.raw_assigned_id}` : null;
    const nameKey = d.raw_assigned_name ? `${d.source_name}::name::${d.raw_assigned_name}` : null;
    if ((idKey && seen.has(idKey)) || (nameKey && seen.has(nameKey))) {
      skippedExisting++;
      continue;
    }
    const matches = nameToIds.get(norm(d.raw_assigned_name));
    if (!matches || matches.length === 0) { noMatch++; continue; }
    if (matches.length > 1) { ambiguous++; continue; }
    toInsert.push({
      source_name: d.source_name,
      raw_assigned_name: d.raw_assigned_name,
      raw_assigned_id: d.raw_assigned_id,
      team_member_id: matches[0],
    });
    // Mark as seen to avoid duplicate inserts within this run
    if (idKey) seen.add(idKey);
    if (nameKey) seen.add(nameKey);
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabaseAdmin
      .from('assigned_name_mappings')
      .insert(toInsert);
    if (insErr) throw new Error(insErr.message);
    created = toInsert.length;
  }

  return { created, ambiguous, noMatch, skippedExisting };
}
