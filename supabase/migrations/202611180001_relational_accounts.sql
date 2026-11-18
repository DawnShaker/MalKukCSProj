-- Stages 5–6. Run as a database owner in the Supabase SQL Editor.
-- Existing agency_state remains an untouched backup. All new writes use tables.
begin;

create table if not exists public.agency_revision (
  id integer primary key check (id = 1), version bigint not null default 0 check (version >= 0)
);
insert into public.agency_revision(id) values (1) on conflict do nothing;
create table if not exists public.agents (
  id uuid primary key, name text not null, "experienceYears" integer not null check ("experienceYears" >= 0)
);
create table if not exists public.clients (
  id uuid primary key, name text not null, "contactInfo" text not null,
  type integer not null check (type in (1,2,3)), "agentId" uuid references public.agents(id) on delete restrict
);
create table if not exists public.properties (
  id uuid primary key, type text not null, area double precision not null check (area > 0),
  address text not null, district text not null, landmark text not null,
  rooms integer not null check (rooms > 0), "yearBuilt" integer not null check ("yearBuilt" >= 1800),
  price numeric(18,2) not null check (price > 0), status integer not null check (status in (1,2,3,4)),
  "agentId" uuid references public.agents(id) on delete restrict
);
create table if not exists public.deals (
  id uuid primary key, date timestamptz not null,
  "propertyId" uuid not null unique references public.properties(id) on delete restrict,
  "clientId" uuid not null references public.clients(id) on delete restrict,
  "agentId" uuid not null references public.agents(id) on delete restrict,
  "totalCost" numeric(18,2) not null check ("totalCost" > 0), type integer not null check (type in (1,2)),
  "commissionPercent" numeric(8,4) not null check ("commissionPercent" between 0 and 100)
);
create table if not exists public.property_status_history (
  id uuid primary key, "propertyId" uuid not null references public.properties(id) on delete cascade,
  "changedAt" timestamptz not null, "oldStatus" integer not null, "newStatus" integer not null,
  comment text not null default '', position integer not null
);
create table if not exists public.property_price_history (
  id uuid primary key, "propertyId" uuid not null references public.properties(id) on delete cascade,
  "changedAt" timestamptz not null, "oldPrice" numeric(18,2) not null, "newPrice" numeric(18,2) not null,
  comment text not null default '', position integer not null
);
create table if not exists public.saved_searches (
  id uuid primary key, "clientId" uuid not null references public.clients(id) on delete cascade,
  "createdAt" timestamptz not null, title text not null, filter jsonb not null default '{}'
);
create table if not exists public.client_requests (
  id uuid primary key, "clientId" uuid not null references public.clients(id) on delete cascade,
  "createdAt" timestamptz not null, title text not null, filter jsonb not null default '{}', "isActive" boolean not null default true
);
create table if not exists public.client_notifications (
  id uuid primary key, "clientId" uuid not null references public.clients(id) on delete cascade,
  message text not null, "createdAt" timestamptz not null default now(), position integer not null
);
create table if not exists public.search_history (
  id uuid primary key, "clientId" uuid not null references public.clients(id) on delete cascade,
  "createdAt" timestamptz not null, filter jsonb not null default '{}', "resultCount" integer not null check ("resultCount" >= 0)
);
create table if not exists public.user_profiles (
  id uuid primary key, email text not null unique, "displayName" text not null,
  role text not null check (role in ('manager','agent','client')),
  "agentId" uuid unique references public.agents(id) on delete restrict,
  "clientId" uuid unique references public.clients(id) on delete restrict,
  "createdAt" timestamptz not null default now(),
  constraint profile_role_link check (
    (role = 'manager' and "agentId" is null and "clientId" is null) or
    (role = 'agent' and "agentId" is not null and "clientId" is null) or
    (role = 'client' and "clientId" is not null and "agentId" is null)
  )
);
create index if not exists properties_agent_idx on public.properties("agentId");
create index if not exists clients_agent_idx on public.clients("agentId");
create index if not exists deals_agent_idx on public.deals("agentId");
create index if not exists requests_client_idx on public.client_requests("clientId");
create index if not exists searches_client_idx on public.saved_searches("clientId");
create index if not exists search_history_client_idx on public.search_history("clientId", "createdAt" desc);
create index if not exists status_property_idx on public.property_status_history("propertyId", position);
create index if not exists price_property_idx on public.property_price_history("propertyId", position);

-- Authorization is performed by Netlify's authenticated API. Browser keys have
-- no direct access, even when somebody forges a role in Supabase user_metadata.
do $$
declare relation text;
begin
  foreach relation in array array['agency_revision','agents','clients','properties','deals','property_status_history','property_price_history','saved_searches','client_requests','client_notifications','search_history','user_profiles'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from anon, authenticated', relation);
    execute format('grant select, insert, update, delete on public.%I to service_role', relation);
  end loop;
end $$;

create or replace function public.agency_read_snapshot() returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'version', (select version from agency_revision where id = 1),
    'data', jsonb_build_object(
      'agents', coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from agents a), '[]'),
      'properties', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'statusHistory', coalesce((select jsonb_agg(to_jsonb(h) order by h.position) from property_status_history h where h."propertyId" = p.id), '[]'),
        'priceHistory', coalesce((select jsonb_agg(to_jsonb(h) order by h.position) from property_price_history h where h."propertyId" = p.id), '[]')
      ) order by p.id) from properties p), '[]'),
      'clients', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'savedSearches', coalesce((select jsonb_agg(to_jsonb(s) order by s."createdAt" desc, s.id) from saved_searches s where s."clientId" = c.id), '[]'),
        'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r."createdAt" desc) from client_requests r where r."clientId" = c.id), '[]'),
        'notifications', coalesce((select jsonb_agg(n.message order by n.position) from client_notifications n where n."clientId" = c.id), '[]')
      ) order by c.id) from clients c), '[]'),
      'deals', coalesce((select jsonb_agg(to_jsonb(d) order by d.date, d.id) from deals d), '[]'),
      'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r."createdAt", r.id) from client_requests r), '[]'),
      'searchHistory', coalesce((select jsonb_agg(to_jsonb(h) order by h."createdAt" desc, h.id) from search_history h), '[]')
    )
  )
$$;

-- Only this fixed allowlist may be used by the transaction helpers.
create or replace function public.agency_upsert_rows(p_table regclass, p_rows jsonb) returns void language plpgsql set search_path = public as $$
declare updates text;
begin
  if p_table::text not in ('agents','clients','properties','deals','client_requests','search_history') then
    raise exception 'Unsupported agency table';
  end if;
  select string_agg(format('%I = excluded.%I', attname, attname), ', ' order by attnum) into updates
    from pg_attribute where attrelid = p_table and attnum > 0 and not attisdropped and attname <> 'id';
  execute format('insert into %s select * from jsonb_populate_recordset(null::%s, $1) on conflict(id) do update set %s', p_table, p_table, updates) using coalesce(p_rows, '[]');
end $$;

create or replace function public.agency_flatten_children(p_data jsonb, p_collection text, p_child text, p_fk text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(
    (case when jsonb_typeof(child.value) = 'string' then jsonb_build_object('message', child.value #>> '{}', 'createdAt', now()) else child.value end)
    || jsonb_build_object(
      p_fk, parent.value->>'id', 'position', child.ordinality - 1,
      'id', coalesce(child.value->>'id', md5((parent.value->>'id') || ':' || p_child || ':' || (child.ordinality - 1)::text)::uuid::text)
    )
  ), '[]')
  from jsonb_array_elements(coalesce(p_data->p_collection, '[]')) parent
  cross join lateral jsonb_array_elements(coalesce(parent.value->p_child, '[]')) with ordinality child
$$;

create or replace function public.agency_save_snapshot(p_expected_version bigint, p_data jsonb) returns boolean language plpgsql set search_path = public as $$
declare current_version bigint;
begin
  select version into current_version from agency_revision where id = 1 for update;
  if current_version <> p_expected_version then return false; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid snapshot'; end if;
  perform agency_upsert_rows('agents', p_data->'agents');
  perform agency_upsert_rows('clients', p_data->'clients');
  perform agency_upsert_rows('properties', p_data->'properties');
  perform agency_upsert_rows('deals', p_data->'deals');

  -- Supabase's Data API enables pg-safeupdate, including inside RPC calls.
  -- These dependent rows are replaced atomically from the locked snapshot.
  delete from property_status_history where "propertyId" is not null;
  delete from property_price_history where "propertyId" is not null;
  delete from saved_searches where "clientId" is not null;
  delete from client_notifications where "clientId" is not null;
  delete from client_requests where "clientId" is not null;
  delete from search_history where "clientId" is not null;
  insert into property_status_history select * from jsonb_populate_recordset(null::property_status_history, agency_flatten_children(p_data, 'properties', 'statusHistory', 'propertyId'));
  insert into property_price_history select * from jsonb_populate_recordset(null::property_price_history, agency_flatten_children(p_data, 'properties', 'priceHistory', 'propertyId'));
  insert into saved_searches select * from jsonb_populate_recordset(null::saved_searches, agency_flatten_children(p_data, 'clients', 'savedSearches', 'clientId'));
  insert into client_notifications select * from jsonb_populate_recordset(null::client_notifications, agency_flatten_children(p_data, 'clients', 'notifications', 'clientId'));
  perform agency_upsert_rows('client_requests', p_data->'requests');
  perform agency_upsert_rows('search_history', p_data->'searchHistory');

  delete from deals where id not in (select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_data->'deals', '[]')));
  delete from properties where id not in (select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_data->'properties', '[]')));
  delete from clients where id not in (select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_data->'clients', '[]')));
  delete from agents where id not in (select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_data->'agents', '[]')));
  update agency_revision set version = version + 1 where id = 1;
  return true;
end $$;

-- Only a verified Auth user, supplied by the server, may be provisioned.
-- Supabase user_metadata and public sign-up parameters never assign a role.
create or replace function public.agency_provision_profile(p_id uuid, p_email text, p_name text, p_role text default 'client')
returns public.user_profiles language plpgsql set search_path = public as $$
declare profile user_profiles; new_client uuid;
begin
  perform 1 from agency_revision where id = 1 for update;
  if p_role not in ('manager','client') then raise exception 'Invalid initial role'; end if;
  select * into profile from user_profiles where id = p_id;
  if found then
    if p_role = 'manager' and not exists(select 1 from user_profiles where role = 'manager') then
      update user_profiles set role = 'manager', "agentId" = null, "clientId" = null where id = p_id returning * into profile;
      update agency_revision set version = version + 1 where id = 1;
    end if;
    return profile;
  end if;
  if p_role = 'manager' and exists(select 1 from user_profiles where role = 'manager') then
    p_role := 'client';
  end if;
  if p_role = 'client' then
    new_client := gen_random_uuid();
    insert into clients(id, name, "contactInfo", type) values (new_client, p_name, p_email, 1);
  end if;
  insert into user_profiles(id, email, "displayName", role, "clientId") values (p_id, lower(p_email), p_name, p_role, new_client) returning * into profile;
  update agency_revision set version = version + 1 where id = 1;
  return profile;
end $$;

create or replace function public.agency_assign_role(p_actor_id uuid, p_id uuid, p_role text, p_agent_id uuid default null, p_client_id uuid default null)
returns public.user_profiles language plpgsql set search_path = public as $$
declare profile user_profiles;
begin
  perform 1 from agency_revision where id = 1 for update;
  if not exists(select 1 from user_profiles where id = p_actor_id and role = 'manager') then raise exception 'Manager role required' using errcode = '42501'; end if;
  if p_role not in ('manager','agent','client') then raise exception 'Invalid role'; end if;
  if p_role <> 'manager' and exists(select 1 from user_profiles where id = p_id and role = 'manager') and (select count(*) from user_profiles where role = 'manager') = 1 then
    raise exception 'Cannot remove the last manager';
  end if;
  update user_profiles set role = p_role, "agentId" = case when p_role = 'agent' then p_agent_id end, "clientId" = case when p_role = 'client' then p_client_id end
    where id = p_id returning * into profile;
  if not found then raise exception 'User profile not found'; end if;
  update agency_revision set version = version + 1 where id = 1;
  return profile;
end $$;

-- Copy the previous cloud snapshot only into an empty new schema. Re-running
-- this migration must never overwrite tables that are already being used.
do $$
declare legacy jsonb; revision bigint;
begin
  if to_regclass('public.agency_state') is not null and not exists(select 1 from agents) and not exists(select 1 from clients) and not exists(select 1 from properties) and not exists(select 1 from deals) then
    select data into legacy from agency_state where id = 'main';
    if legacy is not null then
      select version into revision from agency_revision where id = 1;
      perform agency_save_snapshot(revision, legacy);
    end if;
  end if;
end $$;

revoke all on function public.agency_read_snapshot() from public, anon, authenticated;
revoke all on function public.agency_save_snapshot(bigint,jsonb) from public, anon, authenticated;
revoke all on function public.agency_upsert_rows(regclass,jsonb) from public, anon, authenticated;
revoke all on function public.agency_flatten_children(jsonb,text,text,text) from public, anon, authenticated;
revoke all on function public.agency_provision_profile(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.agency_assign_role(uuid,uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.agency_read_snapshot() to service_role;
grant execute on function public.agency_save_snapshot(bigint,jsonb) to service_role;
grant execute on function public.agency_upsert_rows(regclass,jsonb) to service_role;
grant execute on function public.agency_flatten_children(jsonb,text,text,text) to service_role;
grant execute on function public.agency_provision_profile(uuid,text,text,text) to service_role;
grant execute on function public.agency_assign_role(uuid,uuid,text,uuid,uuid) to service_role;
commit;
