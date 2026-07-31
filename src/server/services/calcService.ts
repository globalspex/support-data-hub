import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type RecalcScope =
  | { kind: 'all' }
  | { kind: 'source'; source: string }
  | { kind: 'team_member'; teamMemberId: string }
  | { kind: 'mapping'; source: string; rawName: string | null; rawId: string | null }
  | { kind: 'ticket_ids'; ids: string[] };

/**
 * Recalculates tag time, final reportable time, labor cost and billable value.
 *
 * The work runs entirely in Postgres (`recalc_tickets`) so it covers every
 * ticket regardless of row limits and finishes in one round-trip. Scopes other
 * than `source` are recalculated globally, which the SQL handles in a single
 * set-based statement.
 */
export async function recalculate(scope: RecalcScope = { kind: 'all' }): Promise<{
  processed: number;
  updated: number;
  unmapped: number;
}> {
  if (scope.kind === 'ticket_ids' && scope.ids.length === 0) {
    return { processed: 0, updated: 0, unmapped: 0 };
  }

  const args = scope.kind === 'source' || scope.kind === 'mapping' ? { _source: scope.source } : {};
  const { data, error } = await supabaseAdmin.rpc('recalc_tickets', args);
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  const processed = Number(row?.processed ?? 0);
  const unmapped = Number(row?.unmapped ?? 0);
  return { processed, updated: processed, unmapped };
}
