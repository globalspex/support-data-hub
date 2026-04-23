import type { ReportFilters } from './reportService';

export function parseFilters(p: URLSearchParams): ReportFilters {
  const f: ReportFilters = {};
  const s = (k: string) => p.get(k) ?? undefined;
  const n = (k: string) => {
    const v = p.get(k);
    if (!v) return undefined;
    const num = Number(v);
    return Number.isFinite(num) ? num : undefined;
  };
  f.company = s('company');
  f.assigned_team_member = s('assigned_team_member');
  f.source_system = s('source_system');
  f.status = s('status');
  f.type = s('type');
  f.inbox = s('inbox');
  f.tag = s('tag');
  f.date_from = s('date_from');
  f.date_to = s('date_to');
  f.month = n('month');
  f.year = n('year');
  return f;
}
