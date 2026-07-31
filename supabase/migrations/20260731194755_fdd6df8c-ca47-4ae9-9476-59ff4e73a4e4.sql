-- 1. sync_runs progress columns
alter table public.sync_runs
  add column if not exists stage text,
  add column if not exists stage_page integer not null default 1,
  add column if not exists cursor jsonb,
  add column if not exists progress_message text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists since_at timestamptz;

-- 2. time_logs staging table (service-role only)
create table if not exists public.time_logs (
  source_name text not null,
  external_entry_id text not null,
  external_ticket_id text not null,
  hours numeric not null default 0,
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (source_name, external_entry_id)
);
grant all on public.time_logs to service_role;
alter table public.time_logs enable row level security;
create index if not exists time_logs_ticket_idx on public.time_logs (source_name, external_ticket_id);

create index if not exists tickets_company_idx on public.tickets (company_name);
create index if not exists tickets_created_source_idx on public.tickets (created_at_source);

-- 3. close out stuck runs
update public.sync_runs
set status = 'error',
    finished_at = now(),
    error_count = coalesce(error_count, 0) + 1,
    error_details = coalesce(error_details, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('stage','abandoned','message','Run was abandoned by an earlier background-sync attempt and never completed.'))
where status = 'running';

-- 4. apply aggregated time logs onto tickets
create or replace function public.apply_time_logs(_source text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  with agg as (
    select external_ticket_id, sum(hours)::numeric as h
    from public.time_logs
    where source_name = _source
    group by external_ticket_id
  )
  update public.tickets t
  set actual_logged_time = agg.h
  from agg
  where t.source_system = _source
    and t.external_ticket_id = agg.external_ticket_id
    and coalesce(t.actual_logged_time, -1) <> agg.h;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.apply_time_logs(text) from public, anon, authenticated;

-- 5. set-based recalculation of tag time, reportable time, mapping, labor and billable
create or replace function public.recalc_tickets(_source text default null)
returns table(processed bigint, unmapped bigint)
language plpgsql
security definer
set search_path = public
as $$
declare _mode text;
begin
  select coalesce((select reportable_time_mode::text from public.reporting_settings limit 1), 'greater_of_actual_or_tag')
    into _mode;

  with scoped as (
    select t.id, t.tags, t.source_system, t.assigned_external_id, t.assigned_name_raw,
           coalesce(t.actual_logged_time, 0)::numeric as actual
    from public.tickets t
    where _source is null or t.source_system = _source
  ),
  computed as (
    select s.id,
           coalesce((
             select sum(r.hours_value)
             from public.tag_time_rules r
             where r.active_status and s.tags is not null and r.tag_name = any(s.tags)
           ), 0)::numeric as tag_time,
           s.actual,
           (
             select m.team_member_id
             from public.assigned_name_mappings m
             where m.source_name = s.source_system
               and (
                 (m.raw_assigned_id is not null and m.raw_assigned_id = s.assigned_external_id)
                 or (m.raw_assigned_name is not null and m.raw_assigned_name = s.assigned_name_raw)
               )
             order by (m.raw_assigned_id is not null) desc
             limit 1
           ) as tmid
    from scoped s
  ),
  finalized as (
    select c.id, c.tag_time, c.tmid,
           case _mode
             when 'actual_only' then c.actual
             when 'tag_only' then c.tag_time
             when 'actual_plus_tag' then c.actual + c.tag_time
             else greatest(c.actual, c.tag_time)
           end as ft
    from computed c
  ),
  upd as (
    update public.tickets t
    set calculated_tag_time = f.tag_time,
        final_reportable_time = f.ft,
        assigned_team_member_id = f.tmid,
        labor_cost = f.ft * coalesce(tm.hourly_cost_rate, 0),
        billable_value = f.ft * coalesce(tm.billable_rate, 0)
    from finalized f
    left join public.team_members tm on tm.id = f.tmid
    where t.id = f.id
    returning t.id, f.tmid as tmid
  )
  select count(*), count(*) filter (where upd.tmid is null) into processed, unmapped from upd;

  return next;
end;
$$;
revoke all on function public.recalc_tickets(text) from public, anon, authenticated;

-- 6. report aggregates over the whole data set
create or replace function public.report_summary(
  _company text default null, _member uuid default null, _source text default null,
  _status text default null, _type text default null, _inbox text default null,
  _tag text default null, _date_from timestamptz default null, _date_to timestamptz default null
) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total_tickets', count(*),
    'total_actual_hours', round(coalesce(sum(t.actual_logged_time), 0)::numeric, 2),
    'total_tag_hours', round(coalesce(sum(t.calculated_tag_time), 0)::numeric, 2),
    'total_reportable_hours', round(coalesce(sum(t.final_reportable_time), 0)::numeric, 2),
    'total_labor_cost', round(coalesce(sum(t.labor_cost), 0)::numeric, 2),
    'total_billable_value', round(coalesce(sum(t.billable_value), 0)::numeric, 2),
    'average_hours_per_ticket', case when count(*) > 0
      then round((coalesce(sum(t.final_reportable_time), 0) / count(*))::numeric, 2) else 0 end
  )
  from public.tickets t
  where (_company is null or t.company_name = _company)
    and (_member is null or t.assigned_team_member_id = _member)
    and (_source is null or t.source_system = _source)
    and (_status is null or t.status = _status)
    and (_type is null or t.type = _type)
    and (_inbox is null or t.inbox = _inbox)
    and (_tag is null or t.tags @> array[_tag])
    and (_date_from is null or t.created_at_source >= _date_from)
    and (_date_to is null or t.created_at_source <= _date_to);
$$;
revoke all on function public.report_summary(text, uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.report_by_company(
  _company text default null, _member uuid default null, _source text default null,
  _status text default null, _type text default null, _inbox text default null,
  _tag text default null, _date_from timestamptz default null, _date_to timestamptz default null
) returns json
language sql stable security definer set search_path = public as $$
  with agg as (
    select coalesce(t.company_name, '— Unassigned —') as company_name,
           count(*) as total_tickets,
           coalesce(sum(t.actual_logged_time), 0)::numeric as actual,
           coalesce(sum(t.final_reportable_time), 0)::numeric as reportable,
           coalesce(sum(t.labor_cost), 0)::numeric as labor,
           coalesce(sum(t.billable_value), 0)::numeric as billable
    from public.tickets t
    where (_company is null or t.company_name = _company)
      and (_member is null or t.assigned_team_member_id = _member)
      and (_source is null or t.source_system = _source)
      and (_status is null or t.status = _status)
      and (_type is null or t.type = _type)
      and (_inbox is null or t.inbox = _inbox)
      and (_tag is null or t.tags @> array[_tag])
      and (_date_from is null or t.created_at_source >= _date_from)
      and (_date_to is null or t.created_at_source <= _date_to)
    group by 1
  ),
  meta as (
    select company_name,
           max(monthly_included_hours) as monthly_included_hours,
           min(account_type) as account_type,
           min(care_plan_type) as care_plan_type
    from public.companies
    where company_name is not null
    group by company_name
  )
  select coalesce(json_agg(x order by x.total_reportable_hours desc), '[]'::json) from (
    select a.company_name,
           m.account_type,
           m.care_plan_type,
           a.total_tickets,
           round(a.actual, 2) as total_actual_hours,
           round(a.reportable, 2) as total_reportable_hours,
           round(a.labor, 2) as total_labor_cost,
           round(a.billable, 2) as total_billable_value,
           coalesce(m.monthly_included_hours, 0) as monthly_included_hours,
           round(a.reportable, 2) as hours_used,
           case when coalesce(m.monthly_included_hours, 0) > 0
             then round(a.reportable / m.monthly_included_hours * 100, 2) else null end as usage_percentage,
           round(greatest(a.reportable - coalesce(m.monthly_included_hours, 0), 0), 2) as overage_hours
    from agg a
    left join meta m on m.company_name = a.company_name
  ) x;
$$;
revoke all on function public.report_by_company(text, uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.report_by_team_member(
  _company text default null, _member uuid default null, _source text default null,
  _status text default null, _type text default null, _inbox text default null,
  _tag text default null, _date_from timestamptz default null, _date_to timestamptz default null
) returns json
language sql stable security definer set search_path = public as $$
  with agg as (
    select t.assigned_team_member_id as tmid,
           count(*) as total_tickets,
           coalesce(sum(t.final_reportable_time), 0)::numeric as reportable,
           coalesce(sum(t.labor_cost), 0)::numeric as labor,
           coalesce(sum(t.billable_value), 0)::numeric as billable
    from public.tickets t
    where (_company is null or t.company_name = _company)
      and (_member is null or t.assigned_team_member_id = _member)
      and (_source is null or t.source_system = _source)
      and (_status is null or t.status = _status)
      and (_type is null or t.type = _type)
      and (_inbox is null or t.inbox = _inbox)
      and (_tag is null or t.tags @> array[_tag])
      and (_date_from is null or t.created_at_source >= _date_from)
      and (_date_to is null or t.created_at_source <= _date_to)
    group by 1
  )
  select coalesce(json_agg(x order by x.total_reportable_hours desc), '[]'::json) from (
    select a.tmid as team_member_id,
           coalesce(tm.name, '— Unmapped —') as team_member_name,
           tm.role,
           tm.department,
           a.total_tickets,
           round(a.reportable, 2) as total_reportable_hours,
           round(a.labor, 2) as total_labor_cost,
           round(a.billable, 2) as total_billable_value
    from agg a
    left join public.team_members tm on tm.id = a.tmid
  ) x;
$$;
revoke all on function public.report_by_team_member(text, uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.report_trends(
  _granularity text default 'month',
  _company text default null, _member uuid default null, _source text default null,
  _status text default null, _type text default null, _inbox text default null,
  _tag text default null, _date_from timestamptz default null, _date_to timestamptz default null
) returns json
language sql stable security definer set search_path = public as $$
  with agg as (
    select to_char(
             date_trunc(case when _granularity = 'day' then 'day' when _granularity = 'year' then 'year' else 'month' end, t.created_at_source),
             case when _granularity = 'day' then 'YYYY-MM-DD' when _granularity = 'year' then 'YYYY' else 'YYYY-MM' end
           ) as period,
           count(*) as total_tickets,
           coalesce(sum(t.final_reportable_time), 0)::numeric as reportable,
           coalesce(sum(t.labor_cost), 0)::numeric as labor,
           coalesce(sum(t.billable_value), 0)::numeric as billable
    from public.tickets t
    where t.created_at_source is not null
      and (_company is null or t.company_name = _company)
      and (_member is null or t.assigned_team_member_id = _member)
      and (_source is null or t.source_system = _source)
      and (_status is null or t.status = _status)
      and (_type is null or t.type = _type)
      and (_inbox is null or t.inbox = _inbox)
      and (_tag is null or t.tags @> array[_tag])
      and (_date_from is null or t.created_at_source >= _date_from)
      and (_date_to is null or t.created_at_source <= _date_to)
    group by 1
  )
  select coalesce(json_agg(x order by x.period), '[]'::json) from (
    select a.period, a.total_tickets,
           round(a.reportable, 2) as total_reportable_hours,
           round(a.labor, 2) as total_labor_cost,
           round(a.billable, 2) as total_billable_value
    from agg a
  ) x;
$$;
revoke all on function public.report_trends(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;