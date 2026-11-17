-- Run once in the Supabase SQL Editor before deploying the Netlify Functions.
-- JSONB preserves the existing C# document model, including nested histories.
begin;

create table if not exists public.agency_state (
  id text primary key check (id = 'main'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version bigint not null default 0 check (version >= 0)
);

alter table public.agency_state enable row level security;
revoke all on public.agency_state from anon, authenticated;
grant select, insert, update on public.agency_state to service_role;

insert into public.agency_state (id, data)
values ('main', '{"properties":[],"clients":[],"agents":[],"deals":[],"requests":[]}'::jsonb)
on conflict (id) do nothing;

commit;
