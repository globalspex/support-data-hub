create or replace function public.bootstrap_team_members(_source text default null)
returns table(members_created integer, mappings_created integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_members integer := 0;
  v_maps integer := 0;
begin
  with names as (
    select distinct trim(t.assigned_name_raw) as name
    from public.tickets t
    where t.assigned_name_raw is not null
      and trim(t.assigned_name_raw) <> ''
      and (_source is null or t.source_system = _source)
  ),
  ins as (
    insert into public.team_members (name, active_status)
    select n.name, true
    from names n
    where not exists (
      select 1 from public.team_members tm where lower(tm.name) = lower(n.name)
    )
    returning 1
  )
  select count(*) into v_members from ins;

  with pairs as (
    select distinct t.source_system as src, trim(t.assigned_name_raw) as name
    from public.tickets t
    where t.assigned_name_raw is not null
      and trim(t.assigned_name_raw) <> ''
      and (_source is null or t.source_system = _source)
  ),
  ins2 as (
    insert into public.assigned_name_mappings (source_name, raw_assigned_name, team_member_id)
    select p.src, p.name, tm.id
    from pairs p
    join public.team_members tm on lower(tm.name) = lower(p.name)
    where not exists (
      select 1 from public.assigned_name_mappings m
      where m.source_name = p.src and lower(coalesce(m.raw_assigned_name, '')) = lower(p.name)
    )
    returning 1
  )
  select count(*) into v_maps from ins2;

  return query select v_members, v_maps;
end;
$$;

revoke all on function public.bootstrap_team_members(text) from public, anon, authenticated;