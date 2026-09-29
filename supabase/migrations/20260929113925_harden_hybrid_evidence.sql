-- Harden the hybrid evidence model without rewriting deployed history.
alter type public.workspace_role add value if not exists 'driver';

alter table public.devices
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists signature_algorithm text not null default 'ECDSA_P256_SHA256';

alter table public.fingerprints
  add column if not exists version integer not null default 0,
  add column if not exists bytes bigint,
  add column if not exists previous_hash text,
  add column if not exists chain_hash text,
  add column if not exists signature text,
  add column if not exists signature_algorithm text,
  add column if not exists received_at timestamptz not null default now();

alter table public.fingerprints
  drop constraint if exists fingerprints_signed_v1_check,
  add constraint fingerprints_signed_v1_check check (
    version = 0 or (
      version = 1 and bytes >= 0 and
      chain_hash ~ '^[0-9a-f]{64}$' and
      signature is not null and length(signature) > 20 and
      signature_algorithm = 'ECDSA_P256_SHA256'
    )
  );

create index if not exists fingerprints_workspace_captured_idx on public.fingerprints (workspace_id, captured_at desc);
create index if not exists fingerprints_device_sequence_idx on public.fingerprints (device_id, sequence desc);
create index if not exists fingerprints_sha256_idx on public.fingerprints (sha256);

alter table public.incidents add column if not exists device_id uuid references public.devices(id) on delete set null;

create table if not exists public.incident_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete restrict,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  fingerprint_id uuid not null references public.fingerprints(id) on delete restrict,
  sequence integer not null check (sequence >= 0),
  captured_at timestamptz not null,
  storage_path text not null unique,
  bytes bigint not null check (bytes >= 0),
  mime_type text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  signature text not null,
  created_at timestamptz not null default now(),
  unique (device_id, sequence)
);

create index if not exists incident_videos_workspace_captured_idx on public.incident_videos (workspace_id, captured_at desc);
create index if not exists incident_videos_incident_idx on public.incident_videos (incident_id);
alter table public.incident_videos enable row level security;

create or replace function public.has_workspace_role(requested_workspace uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.workspace_members
    where workspace_id = requested_workspace
      and user_id = auth.uid()
      and role::text = any(allowed_roles)
  );
$$;

create or replace function public.can_access_device(requested_workspace uuid, requested_device uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.has_workspace_role(requested_workspace, array['admin', 'analyst']) or
    exists (
      select 1 from public.devices
      where id = requested_device and workspace_id = requested_workspace and owner_id = auth.uid()
    )
  );
$$;

create or replace function public.is_workspace_editor(requested_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_workspace_role(requested_workspace, array['admin', 'analyst', 'driver']);
$$;

revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
revoke all on function public.can_access_device(uuid, uuid) from public, anon;
revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_editor(uuid) from public, anon;
revoke all on function public.bootstrap_workspace(text) from public, anon;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function public.can_access_device(uuid, uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_editor(uuid) to authenticated;
grant execute on function public.bootstrap_workspace(text) to authenticated;

drop policy if exists "editors manage devices" on public.devices;
create policy "authorized users insert devices" on public.devices for insert to authenticated
with check (
  workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()) and
  (owner_id = auth.uid() or public.has_workspace_role(workspace_id, array['admin', 'analyst']))
);
create policy "owners update devices" on public.devices for update to authenticated
using (owner_id = auth.uid() or public.has_workspace_role(workspace_id, array['admin', 'analyst']))
with check (owner_id = auth.uid() or public.has_workspace_role(workspace_id, array['admin', 'analyst']));
create policy "administrators delete devices" on public.devices for delete to authenticated
using (public.has_workspace_role(workspace_id, array['admin']));

drop policy if exists "editors insert fingerprints" on public.fingerprints;
drop policy if exists "editors update fingerprints" on public.fingerprints;
drop policy if exists "editors delete fingerprints" on public.fingerprints;
create policy "authorized devices insert fingerprints" on public.fingerprints for insert to authenticated
with check (
  public.can_access_device(workspace_id, device_id) and
  exists (select 1 from public.devices where id = device_id and workspace_id = fingerprints.workspace_id)
);

drop policy if exists "editors insert segments" on public.evidence_segments;
drop policy if exists "editors update segments" on public.evidence_segments;
revoke insert, update, delete on public.evidence_segments from authenticated, anon;
grant select on public.evidence_segments to authenticated;

drop policy if exists "members read incidents" on public.incidents;
drop policy if exists "editors manage incidents" on public.incidents;
create policy "authorized users read incidents" on public.incidents for select to authenticated
using (device_id is null or public.can_access_device(workspace_id, device_id));
create policy "authorized users insert incidents" on public.incidents for insert to authenticated
with check (device_id is not null and public.can_access_device(workspace_id, device_id));
create policy "analysts update incidents" on public.incidents for update to authenticated
using (public.has_workspace_role(workspace_id, array['admin', 'analyst']))
with check (public.has_workspace_role(workspace_id, array['admin', 'analyst']));

create policy "authorized users read incident videos" on public.incident_videos for select to authenticated
using (public.can_access_device(workspace_id, device_id));
create policy "authorized users insert incident videos" on public.incident_videos for insert to authenticated
with check (
  public.can_access_device(workspace_id, device_id) and
  exists (select 1 from public.fingerprints f where f.id = fingerprint_id and f.device_id = incident_videos.device_id and f.sequence = incident_videos.sequence)
);

drop policy if exists "authenticated users read owned evidence objects" on storage.objects;
drop policy if exists "authenticated users upload owned evidence objects" on storage.objects;
drop policy if exists "authenticated users update owned evidence objects" on storage.objects;
create policy "authorized users read incident objects" on storage.objects for select to authenticated
using (
  bucket_id = 'evidence' and
  public.can_access_device(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid) and
  exists (
    select 1 from public.incidents i
    where i.id = ((storage.foldername(name))[3])::uuid
      and i.workspace_id = ((storage.foldername(name))[1])::uuid
      and i.device_id = ((storage.foldername(name))[2])::uuid
  )
);
create policy "authorized users upload incident objects" on storage.objects for insert to authenticated
with check (
  bucket_id = 'evidence' and
  public.can_access_device(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid) and
  exists (
    select 1 from public.incidents i
    where i.id = ((storage.foldername(name))[3])::uuid
      and i.workspace_id = ((storage.foldername(name))[1])::uuid
      and i.device_id = ((storage.foldername(name))[2])::uuid
  )
);

revoke update, delete on public.fingerprints from authenticated, anon;
grant select, insert on public.fingerprints to authenticated;
grant select, insert on public.incident_videos to authenticated;
grant select, insert, update on public.incidents to authenticated;
revoke update on public.devices from authenticated, anon;
grant select, insert on public.devices to authenticated;
grant update (label, active, last_seen_at) on public.devices to authenticated;

alter publication supabase_realtime add table public.incident_videos;
