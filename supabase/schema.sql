-- Clearance Gateway database schema (SPEC §11).
-- Apply in the Supabase SQL editor. Safe to re-run.
-- gen_random_uuid() is built into Postgres 13+, so no pgcrypto extension is needed.

create table if not exists policy_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  raw_text text not null,
  compiled jsonb not null,
  status text not null check (status in ('draft','active','archived')),
  compiled_by text,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create unique index if not exists one_active_policy on policy_versions (status) where status = 'active';

-- Metadata only. Never store raw prompt or response text here (CLAUDE.md rule 3).
create table if not exists audit_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  channel text,            -- web | extension | api | eval
  role text,
  policy_version int,
  data_classes text[],
  final_action text,       -- allow | redact | tokenise | block
  rule_ids text[],
  provider text,
  outcome text,            -- sent | blocked | error
  latency_ms int,
  prev_hash text,          -- COULD: hash chain
  hash text
);
-- GET /api/audit reads the most recent events.
create index if not exists audit_events_at_idx on audit_events (at desc);

create table if not exists usage_counters (
  day date not null,
  client_hash text not null,   -- salted hash of client IP; never the raw IP
  count int not null default 0,
  primary key (day, client_hash)
);

alter table policy_versions enable row level security;
alter table audit_events    enable row level security;
alter table usage_counters  enable row level security;
-- No RLS policies: only the API (service role) can read or write.

-- Simulated provider outages for the failover demo (SPEC §8). Stored in the database, not in
-- memory, so every serverless instance sees the admin's toggle. Set only via /api/admin/outage.
create table if not exists simulated_outages (
  provider_id text primary key,
  down boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table simulated_outages enable row level security;

-- Atomic per-day usage counter for rate limiting (SPEC §15). Returns the new count.
create or replace function increment_usage(p_day date, p_client_hash text)
returns int
language sql
set search_path = public
as $$
  insert into usage_counters (day, client_hash, count) values (p_day, p_client_hash, 1)
  on conflict (day, client_hash) do update set count = usage_counters.count + 1
  returning count;
$$;
-- Only the API (service role) may call it; never anonymous clients through the Data API.
revoke execute on function increment_usage(date, text) from public, anon, authenticated;
grant execute on function increment_usage(date, text) to service_role;

-- Atomically make one policy version active and archive the previous one (SPEC §10).
-- Doing both in one function avoids a window with no active policy.
create or replace function activate_policy(p_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v int;
begin
  select version into v from policy_versions where id = p_id;
  if v is null then
    raise exception 'policy version not found';
  end if;
  update policy_versions set status = 'archived' where status = 'active' and id <> p_id;
  update policy_versions set status = 'active', activated_at = now() where id = p_id;
  return v;
end;
$$;
revoke execute on function activate_policy(uuid) from public, anon, authenticated;
grant execute on function activate_policy(uuid) to service_role;
