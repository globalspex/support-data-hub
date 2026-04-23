import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type RecalcScope =
  | { kind: 'all' }
  | { kind: 'source'; source: string }
  | { kind: 'team_member'; teamMemberId: string }
  | { kind: 'mapping'; source: string; rawName: string | null; rawId: string | null }
  | { kind: 'ticket_ids'; ids: string[] };

type Mode = 'actual_only' | 'tag_only' | 'greater_of_actual_or_tag' | 'actual_plus_tag';

interface TicketRow {
  id: string;
  source_system: string;
  tags: string[] | null;
  actual_logged_time: number | null;
  assigned_name_raw: string | null;
  assigned_external_id: string | null;
}

interface TeamMember {
  id: string;
  hourly_cost_rate: number;
  billable_rate: number;
}

interface MappingRow {
  source_name: string;
  raw_assigned_name: string | null;
  raw_assigned_id: string | null;
  team_member_id: string | null;
}

function computeFinal(mode: Mode, actual: number, tag: number): number {
  switch (mode) {
    case 'actual_only': return actual;
    case 'tag_only': return tag;
    case 'actual_plus_tag': return actual + tag;
    case 'greater_of_actual_or_tag':
    default: return Math.max(actual, tag);
  }
}

function mappingKey(source: string, rawId: string | null, rawName: string | null): string {
  return `${source}::${rawId ?? ''}::${rawName ?? ''}`;
}

export async function recalculate(scope: RecalcScope = { kind: 'all' }): Promise<{
  processed: number;
  updated: number;
  unmapped: number;
}> {
  // 1. Load active tag rules (case-sensitive)
  const { data: rules } = await supabaseAdmin
    .from('tag_time_rules')
    .select('tag_name,hours_value,active_status')
    .eq('active_status', true);
  const ruleMap = new Map<string, number>();
  for (const r of rules ?? []) ruleMap.set(r.tag_name, Number(r.hours_value));

  // 2. Load reporting mode
  const { data: settingsRow } = await supabaseAdmin
    .from('reporting_settings')
    .select('reportable_time_mode')
    .limit(1)
    .maybeSingle();
  const mode = (settingsRow?.reportable_time_mode ?? 'greater_of_actual_or_tag') as Mode;

  // 3. Load mappings + team members
  const { data: mappings } = await supabaseAdmin
    .from('assigned_name_mappings')
    .select('source_name,raw_assigned_name,raw_assigned_id,team_member_id');
  const mapByKey = new Map<string, string | null>();
  for (const m of (mappings ?? []) as MappingRow[]) {
    // Index by both id-key and name-key so either can match.
    if (m.raw_assigned_id) mapByKey.set(mappingKey(m.source_name, m.raw_assigned_id, null), m.team_member_id);
    if (m.raw_assigned_name) mapByKey.set(mappingKey(m.source_name, null, m.raw_assigned_name), m.team_member_id);
  }

  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id,hourly_cost_rate,billable_rate');
  const memberMap = new Map<string, TeamMember>();
  for (const tm of (members ?? []) as TeamMember[]) {
    memberMap.set(tm.id, {
      id: tm.id,
      hourly_cost_rate: Number(tm.hourly_cost_rate),
      billable_rate: Number(tm.billable_rate),
    });
  }

  // 4. Build ticket query for scope
  let q = supabaseAdmin
    .from('tickets')
    .select('id,source_system,tags,actual_logged_time,assigned_name_raw,assigned_external_id');

  switch (scope.kind) {
    case 'source':
      q = q.eq('source_system', scope.source);
      break;
    case 'team_member':
      q = q.eq('assigned_team_member_id', scope.teamMemberId);
      break;
    case 'mapping':
      q = q.eq('source_system', scope.source);
      if (scope.rawId) q = q.eq('assigned_external_id', scope.rawId);
      else if (scope.rawName) q = q.eq('assigned_name_raw', scope.rawName);
      break;
    case 'ticket_ids':
      if (scope.ids.length === 0) return { processed: 0, updated: 0, unmapped: 0 };
      q = q.in('id', scope.ids);
      break;
    case 'all':
    default:
      break;
  }

  const { data: tickets, error } = await q;
  if (error) throw new Error(error.message);

  let processed = 0;
  let updatedCount = 0;
  let unmapped = 0;

  for (const t of (tickets ?? []) as TicketRow[]) {
    processed++;
    const tags = t.tags ?? [];
    let tagTime = 0;
    for (const tag of tags) {
      const v = ruleMap.get(tag); // case-sensitive exact match
      if (v) tagTime += v;
    }
    const actual = Number(t.actual_logged_time ?? 0);
    const finalTime = computeFinal(mode, actual, tagTime);

    // Resolve team member via mapping (id key first, then name key)
    let teamMemberId: string | null = null;
    if (t.assigned_external_id) {
      teamMemberId = mapByKey.get(mappingKey(t.source_system, t.assigned_external_id, null)) ?? null;
    }
    if (!teamMemberId && t.assigned_name_raw) {
      teamMemberId = mapByKey.get(mappingKey(t.source_system, null, t.assigned_name_raw)) ?? null;
    }

    let laborCost = 0;
    let billableValue = 0;
    if (teamMemberId) {
      const tm = memberMap.get(teamMemberId);
      if (tm) {
        laborCost = finalTime * tm.hourly_cost_rate;
        billableValue = finalTime * tm.billable_rate;
      }
    } else {
      unmapped++;
    }

    const { error: upErr } = await supabaseAdmin
      .from('tickets')
      .update({
        calculated_tag_time: tagTime,
        final_reportable_time: finalTime,
        labor_cost: laborCost,
        billable_value: billableValue,
        assigned_team_member_id: teamMemberId,
      })
      .eq('id', t.id);
    if (!upErr) updatedCount++;
  }

  return { processed, updated: updatedCount, unmapped };
}
