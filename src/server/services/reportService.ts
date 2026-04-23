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

interface TicketAgg {
  id: string;
  company_name: string | null;
  assigned_team_member_id: string | null;
  actual_logged_time: number | null;
  calculated_tag_time: number | null;
  final_reportable_time: number | null;
  labor_cost: number | null;
  billable_value: number | null;
  created_at_source: string | null;
}

async function fetchTickets(f: ReportFilters): Promise<TicketAgg[]> {
  let q = supabaseAdmin.from('tickets').select(
    'id,company_name,assigned_team_member_id,actual_logged_time,calculated_tag_time,final_reportable_time,labor_cost,billable_value,created_at_source',
  );
  if (f.company) q = q.eq('company_name', f.company);
  if (f.assigned_team_member) q = q.eq('assigned_team_member_id', f.assigned_team_member);
  if (f.source_system) q = q.eq('source_system', f.source_system);
  if (f.status) q = q.eq('status', f.status);
  if (f.type) q = q.eq('type', f.type);
  if (f.inbox) q = q.eq('inbox', f.inbox);
  if (f.tag) q = q.contains('tags', [f.tag]);
  if (f.date_from) q = q.gte('created_at_source', f.date_from);
  if (f.date_to) q = q.lte('created_at_source', f.date_to);
  if (f.year && !f.month) {
    const start = `${f.year}-01-01`;
    const end = `${f.year + 1}-01-01`;
    q = q.gte('created_at_source', start).lt('created_at_source', end);
  }
  if (f.month && f.year) {
    const startDate = new Date(Date.UTC(f.year, f.month - 1, 1)).toISOString();
    const endDate = new Date(Date.UTC(f.year, f.month, 1)).toISOString();
    q = q.gte('created_at_source', startDate).lt('created_at_source', endDate);
  }
  const { data, error } = await q.limit(50000);
  if (error) throw new Error(error.message);
  return (data ?? []) as TicketAgg[];
}

export async function summary(f: ReportFilters) {
  const tickets = await fetchTickets(f);
  const total = tickets.length;
  let actual = 0, tag = 0, reportable = 0, labor = 0, billable = 0;
  for (const t of tickets) {
    actual += Number(t.actual_logged_time ?? 0);
    tag += Number(t.calculated_tag_time ?? 0);
    reportable += Number(t.final_reportable_time ?? 0);
    labor += Number(t.labor_cost ?? 0);
    billable += Number(t.billable_value ?? 0);
  }
  return {
    total_tickets: total,
    total_actual_hours: round(actual),
    total_tag_hours: round(tag),
    total_reportable_hours: round(reportable),
    total_labor_cost: round(labor),
    total_billable_value: round(billable),
    average_hours_per_ticket: total ? round(reportable / total) : 0,
  };
}

export async function byCompany(f: ReportFilters) {
  const tickets = await fetchTickets(f);
  const { data: companies } = await supabaseAdmin
    .from('companies')
    .select('company_name,monthly_included_hours,account_type,care_plan_type');
  const companyMeta = new Map<string, { monthly_included_hours: number; account_type: string | null; care_plan_type: string | null }>();
  for (const c of companies ?? []) {
    if (!c.company_name) continue;
    const existing = companyMeta.get(c.company_name);
    // Prefer the first non-zero included hours entry if multiple sources
    if (!existing || (existing.monthly_included_hours === 0 && Number(c.monthly_included_hours) > 0)) {
      companyMeta.set(c.company_name, {
        monthly_included_hours: Number(c.monthly_included_hours ?? 0),
        account_type: c.account_type ?? null,
        care_plan_type: c.care_plan_type ?? null,
      });
    }
  }

  const buckets = new Map<string, { tickets: number; reportable: number; labor: number; billable: number; actual: number }>();
  for (const t of tickets) {
    const key = t.company_name ?? '— Unassigned —';
    const b = buckets.get(key) ?? { tickets: 0, reportable: 0, labor: 0, billable: 0, actual: 0 };
    b.tickets++;
    b.reportable += Number(t.final_reportable_time ?? 0);
    b.labor += Number(t.labor_cost ?? 0);
    b.billable += Number(t.billable_value ?? 0);
    b.actual += Number(t.actual_logged_time ?? 0);
    buckets.set(key, b);
  }

  return Array.from(buckets.entries())
    .map(([company_name, b]) => {
      const meta = companyMeta.get(company_name);
      const included = meta?.monthly_included_hours ?? 0;
      const overage = Math.max(b.reportable - included, 0);
      return {
        company_name,
        account_type: meta?.account_type ?? null,
        care_plan_type: meta?.care_plan_type ?? null,
        total_tickets: b.tickets,
        total_actual_hours: round(b.actual),
        total_reportable_hours: round(b.reportable),
        total_labor_cost: round(b.labor),
        total_billable_value: round(b.billable),
        monthly_included_hours: included,
        hours_used: round(b.reportable),
        usage_percentage: included > 0 ? round((b.reportable / included) * 100) : null,
        overage_hours: round(overage),
      };
    })
    .sort((a, b) => b.total_reportable_hours - a.total_reportable_hours);
}

export async function byTeamMember(f: ReportFilters) {
  const tickets = await fetchTickets(f);
  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id,name,role,department,active_status');
  const memberMap = new Map<string, { name: string; role: string | null; department: string | null }>();
  for (const m of members ?? []) {
    memberMap.set(m.id, { name: m.name, role: m.role ?? null, department: m.department ?? null });
  }

  const buckets = new Map<string, { tickets: number; reportable: number; labor: number; billable: number }>();
  for (const t of tickets) {
    const key = t.assigned_team_member_id ?? '__unmapped__';
    const b = buckets.get(key) ?? { tickets: 0, reportable: 0, labor: 0, billable: 0 };
    b.tickets++;
    b.reportable += Number(t.final_reportable_time ?? 0);
    b.labor += Number(t.labor_cost ?? 0);
    b.billable += Number(t.billable_value ?? 0);
    buckets.set(key, b);
  }

  return Array.from(buckets.entries())
    .map(([id, b]) => {
      const m = id === '__unmapped__' ? null : memberMap.get(id);
      return {
        team_member_id: id === '__unmapped__' ? null : id,
        team_member_name: m?.name ?? '— Unmapped —',
        role: m?.role ?? null,
        department: m?.department ?? null,
        total_tickets: b.tickets,
        total_reportable_hours: round(b.reportable),
        total_labor_cost: round(b.labor),
        total_billable_value: round(b.billable),
      };
    })
    .sort((a, b) => b.total_reportable_hours - a.total_reportable_hours);
}

export async function trends(f: ReportFilters, granularity: 'day' | 'month' | 'year') {
  const tickets = await fetchTickets(f);
  const buckets = new Map<string, { tickets: number; reportable: number; labor: number; billable: number }>();
  for (const t of tickets) {
    if (!t.created_at_source) continue;
    const d = new Date(t.created_at_source);
    let key: string;
    if (granularity === 'day') key = d.toISOString().slice(0, 10);
    else if (granularity === 'month') key = d.toISOString().slice(0, 7);
    else key = String(d.getUTCFullYear());
    const b = buckets.get(key) ?? { tickets: 0, reportable: 0, labor: 0, billable: 0 };
    b.tickets++;
    b.reportable += Number(t.final_reportable_time ?? 0);
    b.labor += Number(t.labor_cost ?? 0);
    b.billable += Number(t.billable_value ?? 0);
    buckets.set(key, b);
  }

  return Array.from(buckets.entries())
    .map(([period, b]) => ({
      period,
      total_tickets: b.tickets,
      total_reportable_hours: round(b.reportable),
      total_labor_cost: round(b.labor),
      total_billable_value: round(b.billable),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
