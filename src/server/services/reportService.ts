import { supabaseAdmin } from '@/integrations/supabase/client.server';

export interface ReportFilters {
  company?: string;
  assigned_team_member?: string; // uuid
  source_system?: string;
  status?: string;
  type?: string;
  inbox?: string;
  tag?: string;
  date_from?: string;
  date_to?: string;
  month?: number; // 1-12
  year?: number;
}

/**
 * Aggregation runs in Postgres so totals cover every matching ticket.
 * (Reading rows through the Data API caps out and produced wrong totals.)
 */
function rpcArgs(f: ReportFilters) {
  let dateFrom = f.date_from ?? null;
  let dateTo = f.date_to ?? null;

  if (f.year && !f.month) {
    dateFrom = new Date(Date.UTC(f.year, 0, 1)).toISOString();
    dateTo = new Date(Date.UTC(f.year, 11, 31, 23, 59, 59)).toISOString();
  }
  if (f.year && f.month) {
    dateFrom = new Date(Date.UTC(f.year, f.month - 1, 1)).toISOString();
    dateTo = new Date(Date.UTC(f.year, f.month, 1)).toISOString();
  }

  return {
    _company: f.company ?? undefined,
    _member: f.assigned_team_member ?? undefined,
    _source: f.source_system ?? undefined,
    _status: f.status ?? undefined,
    _type: f.type ?? undefined,
    _inbox: f.inbox ?? undefined,
    _tag: f.tag ?? undefined,
    _date_from: dateFrom ?? undefined,
    _date_to: dateTo ?? undefined,
  };
}

export interface SummaryResult {
  total_tickets: number;
  total_actual_hours: number;
  total_tag_hours: number;
  total_reportable_hours: number;
  total_labor_cost: number;
  total_billable_value: number;
  average_hours_per_ticket: number;
}

export async function summary(f: ReportFilters): Promise<SummaryResult> {
  const { data, error } = await supabaseAdmin.rpc('report_summary', rpcArgs(f));
  if (error) throw new Error(error.message);
  return (data ?? {
    total_tickets: 0,
    total_actual_hours: 0,
    total_tag_hours: 0,
    total_reportable_hours: 0,
    total_labor_cost: 0,
    total_billable_value: 0,
    average_hours_per_ticket: 0,
  }) as unknown as SummaryResult;
}

export async function byCompany(f: ReportFilters) {
  const { data, error } = await supabaseAdmin.rpc('report_by_company', rpcArgs(f));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown[];
}

export async function byTeamMember(f: ReportFilters) {
  const { data, error } = await supabaseAdmin.rpc('report_by_team_member', rpcArgs(f));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown[];
}

export async function trends(f: ReportFilters, granularity: 'day' | 'month' | 'year') {
  const { data, error } = await supabaseAdmin.rpc('report_trends', {
    _granularity: granularity,
    ...rpcArgs(f),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown[];
}
