create extension if not exists pgcrypto;

create type public.workspace_role as enum ('admin', 'analyst', 'viewer');
create type public.segment_status as enum ('queued', 'transmitted', 'verified', 'rejected');
create type public.incident_severity as enum ('low', 'medium', 'high', 'critical');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New analyst',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  primary key (workspace_id, user_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label text not null,
  public_key text not null,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.evidence_segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  captured_at timestamptz not null,
  object_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  previous_hash text,
  chain_hash text not null check (chain_hash ~ '^[0-9a-f]{64}$'),
  signature text,
  bytes integer not null check (bytes >= 0),
  status public.segment_status not null default 'queued',
  locked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (device_id, sequence)
);

create table public.integrity_checks (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.evidence_segments(id) on delete cascade,
  checked_by uuid references public.profiles(id),
  expected_hash text not null,
  observed_hash text not null,
  is_valid boolean not null,
  checked_at timestamptz not null default now()
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  segment_id uuid references public.evidence_segments(id) on delete set null,
  title text not null,
  severity public.incident_severity not null default 'medium',
  status text not null default 'open',
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  target text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(requested_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = requested_workspace and user_id = auth.uid());
$$;

create or replace function public.is_workspace_editor(requested_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = requested_workspace and user_id = auth.uid() and role in ('admin', 'analyst'));
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.devices enable row level security;
alter table public.evidence_segments enable row level security;
alter table public.integrity_checks enable row level security;
alter table public.incidents enable row level security;
alter table public.audit_events enable row level security;

create policy "workspace members read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "users read own profile" on public.profiles for select using (id = auth.uid());
create policy "users update own profile" on public.profiles for update using (id = auth.uid());
create policy "members read memberships" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy "members read devices" on public.devices for select using (public.is_workspace_member(workspace_id));
create policy "editors manage devices" on public.devices for all using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));
create policy "members read segments" on public.evidence_segments for select using (public.is_workspace_member(workspace_id));
create policy "editors insert segments" on public.evidence_segments for insert with check (public.is_workspace_editor(workspace_id));
create policy "editors update segments" on public.evidence_segments for update using (public.is_workspace_editor(workspace_id));
create policy "members read checks" on public.integrity_checks for select using (exists (select 1 from public.evidence_segments s where s.id = segment_id and public.is_workspace_member(s.workspace_id)));
create policy "editors insert checks" on public.integrity_checks for insert with check (exists (select 1 from public.evidence_segments s where s.id = segment_id and public.is_workspace_editor(s.workspace_id)));
create policy "members read incidents" on public.incidents for select using (public.is_workspace_member(workspace_id));
create policy "editors manage incidents" on public.incidents for all using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));
create policy "members read audit events" on public.audit_events for select using (public.is_workspace_member(workspace_id));
create policy "editors insert audit events" on public.audit_events for insert with check (public.is_workspace_editor(workspace_id));

alter publication supabase_realtime add table public.evidence_segments, public.incidents, public.integrity_checks;
