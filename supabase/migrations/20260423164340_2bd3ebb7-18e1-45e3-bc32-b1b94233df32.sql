-- ENUM for reporting mode
do $$ begin
  create type public.reportable_time_mode as enum ('actual_only','tag_only','greater_of_actual_or_tag','actual_plus_tag');
exception when duplicate_object then null; end $$;

-- team_members
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  department text,
  hourly_cost_rate numeric not null default 0,
  billable_rate numeric not null default 0,
  active_status boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
create policy "admins all team_members" on public.team_members for all to authenticated
  using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create trigger team_members_set_updated_at before update on public.team_members
  for each row execute function public.tg_set_updated_at();

-- tag_time_rules
create table public.tag_time_rules (
  id uuid primary key default gen_random_uuid(),
  tag_name text not null unique,
  hours_value numeric not null default 0,
  active_status boolean not null default true,
  stacking_priority integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tag_time_rules enable row level security;
create policy "admins all tag_time_rules" on public.tag_time_rules for all to authenticated
  using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create trigger tag_time_rules_set_updated_at before update on public.tag_time_rules
  for each row execute function public.tg_set_updated_at();

insert into public.tag_time_rules (tag_name, hours_value, active_status, notes) values
  ('CarePlanManage', 1.0, true, 'Default Phase 2 seed'),
  ('CarePlanTech',   0.5, true, 'Default Phase 2 seed')
on conflict (tag_name) do nothing;

-- reporting_settings (singleton)
create table public.reporting_settings (
  id uuid primary key default gen_random_uuid(),
  reportable_time_mode public.reportable_time_mode not null default 'greater_of_actual_or_tag',
  default_date_range text not null default 'this_month',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reporting_settings enable row level security;
create policy "admins all reporting_settings" on public.reporting_settings for all to authenticated
  using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create trigger reporting_settings_set_updated_at before update on public.reporting_settings
  for each row execute function public.tg_set_updated_at();

insert into public.reporting_settings (reportable_time_mode, default_date_range) values
  ('greater_of_actual_or_tag','this_month');

-- extend tickets
alter table public.tickets
  add column if not exists assigned_team_member_id uuid references public.team_members(id) on delete set null,
  add column if not exists calculated_tag_time numeric not null default 0,
  add column if not exists final_reportable_time numeric not null default 0,
  add column if not exists labor_cost numeric not null default 0,
  add column if not exists billable_value numeric not null default 0;

create index if not exists idx_tickets_company_name on public.tickets (company_name);
create index if not exists idx_tickets_assigned_team_member on public.tickets (assigned_team_member_id);
create index if not exists idx_tickets_created_at_source on public.tickets (created_at_source);
create index if not exists idx_tickets_source_system on public.tickets (source_system);

-- extend companies
alter table public.companies
  add column if not exists account_type text,
  add column if not exists monthly_included_hours numeric not null default 0,
  add column if not exists care_plan_type text,
  add column if not exists notes text;

-- extend assigned_name_mappings
alter table public.assigned_name_mappings
  add column if not exists team_member_id uuid references public.team_members(id) on delete set null;
create index if not exists idx_assigned_mappings_lookup
  on public.assigned_name_mappings (source_name, raw_assigned_name, raw_assigned_id);
