
-- Roles
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Auto-assign admin to first signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  user_count int;
begin
  select count(*) into user_count from auth.users;
  if user_count = 1 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'user');
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy "users read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "admins read all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger helper
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- integration_connections
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  source_name text not null unique,
  is_enabled boolean not null default false,
  base_url text,
  api_key_or_token text,
  auth_type text default 'basic_token',
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  status text default 'unconfigured',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integration_connections enable row level security;
create trigger trg_ic_updated before update on public.integration_connections
  for each row execute function public.tg_set_updated_at();

-- tickets
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  external_ticket_id text not null,
  external_company_id text,
  company_name text,
  ticket_title text,
  status text,
  type text,
  assigned_name_raw text,
  assigned_external_id text,
  customer_name text,
  inbox text,
  tags text[] default '{}',
  ticket_url text,
  created_at_source timestamptz,
  updated_at_source timestamptz,
  closed_at_source timestamptz,
  actual_logged_time numeric,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, external_ticket_id)
);
alter table public.tickets enable row level security;
create trigger trg_t_updated before update on public.tickets
  for each row execute function public.tg_set_updated_at();
create index tickets_company_idx on public.tickets (company_name);
create index tickets_assigned_idx on public.tickets (assigned_name_raw);
create index tickets_status_idx on public.tickets (status);
create index tickets_created_idx on public.tickets (created_at_source desc);

-- companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  external_company_id text,
  company_name text,
  active_status boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_name, external_company_id)
);
alter table public.companies enable row level security;
create trigger trg_c_updated before update on public.companies
  for each row execute function public.tg_set_updated_at();

-- assigned_name_mappings
create table public.assigned_name_mappings (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  raw_assigned_name text,
  raw_assigned_id text,
  normalized_team_member_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_name, raw_assigned_id)
);
alter table public.assigned_name_mappings enable row level security;
create trigger trg_anm_updated before update on public.assigned_name_mappings
  for each row execute function public.tg_set_updated_at();

-- sync_runs
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  sync_type text not null default 'manual',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_received int default 0,
  records_created int default 0,
  records_updated int default 0,
  error_count int default 0,
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sync_runs enable row level security;
create trigger trg_sr_updated before update on public.sync_runs
  for each row execute function public.tg_set_updated_at();
create index sync_runs_started_idx on public.sync_runs (started_at desc);

-- Admin-only RLS for all data tables. All write/sensitive ops happen via service role on server.
create policy "admins all integration_connections" on public.integration_connections
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admins all tickets" on public.tickets
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admins all companies" on public.companies
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admins all assigned_name_mappings" on public.assigned_name_mappings
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admins all sync_runs" on public.sync_runs
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- seed integration rows
insert into public.integration_connections (source_name, status) values
  ('teamwork', 'unconfigured'),
  ('teamwork_desk', 'unconfigured');
