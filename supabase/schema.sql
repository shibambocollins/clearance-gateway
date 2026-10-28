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
