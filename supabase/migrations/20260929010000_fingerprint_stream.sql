create table public.fingerprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null,
  source text not null default 'camera-frame',
  created_at timestamptz not null default now(),
  unique (device_id, sequence)
);

alter table public.fingerprints enable row level security;

create policy "members read fingerprints" on public.fingerprints
for select using (public.is_workspace_member(workspace_id));

create policy "editors insert fingerprints" on public.fingerprints
for insert with check (public.is_workspace_editor(workspace_id));

create policy "editors update fingerprints" on public.fingerprints
for update using (public.is_workspace_editor(workspace_id));

create policy "editors delete fingerprints" on public.fingerprints
for delete using (public.is_workspace_editor(workspace_id));

alter publication supabase_realtime add table public.fingerprints;
