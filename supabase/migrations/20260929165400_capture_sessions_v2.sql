create table public.capture_sessions (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index capture_sessions_workspace_started_idx on public.capture_sessions (workspace_id, started_at desc);
create index capture_sessions_device_started_idx on public.capture_sessions (device_id, started_at desc);
alter table public.capture_sessions enable row level security;

create policy "authorized users read capture sessions" on public.capture_sessions for select to authenticated
using (public.can_access_device(workspace_id, device_id));
create policy "authorized users insert capture sessions" on public.capture_sessions for insert to authenticated
with check (public.can_access_device(workspace_id, device_id));
create policy "authorized users close capture sessions" on public.capture_sessions for update to authenticated
using (public.can_access_device(workspace_id, device_id))
with check (public.can_access_device(workspace_id, device_id));

alter table public.fingerprints
  add column session_id uuid references public.capture_sessions(id) on delete restrict,
  add column segment_id uuid;

alter table public.fingerprints drop constraint if exists fingerprints_device_id_sequence_key;
alter table public.fingerprints
  add constraint fingerprints_session_sequence_key unique (session_id, sequence),
  add constraint fingerprints_segment_id_key unique (segment_id),
  drop constraint if exists fingerprints_signed_v1_check,
  add constraint fingerprints_signed_evidence_check check (
    version = 0 or (
      version = 1 and bytes >= 0 and chain_hash ~ '^[0-9a-f]{64}$' and signature is not null and length(signature) > 20 and signature_algorithm = 'ECDSA_P256_SHA256'
    ) or (
      version = 2 and session_id is not null and segment_id is not null and bytes >= 0 and chain_hash ~ '^[0-9a-f]{64}$' and signature is not null and length(signature) > 20 and signature_algorithm = 'ECDSA_P256_SHA256'
    )
  );

create index fingerprints_session_sequence_idx on public.fingerprints (session_id, sequence);
create index fingerprints_segment_idx on public.fingerprints (segment_id);
create unique index fingerprints_legacy_device_sequence_key on public.fingerprints (device_id, sequence) where version < 2;

drop policy if exists "authorized devices insert fingerprints" on public.fingerprints;
create policy "authorized devices insert fingerprints" on public.fingerprints for insert to authenticated
with check (
  public.can_access_device(workspace_id, device_id) and
  exists (select 1 from public.devices where id = device_id and workspace_id = fingerprints.workspace_id) and
  (
    version < 2 or exists (
      select 1 from public.capture_sessions s
      where s.id = session_id and s.workspace_id = fingerprints.workspace_id and s.device_id = fingerprints.device_id
    )
  )
);

alter table public.incident_videos
  add column session_id uuid references public.capture_sessions(id) on delete restrict,
  add column segment_id uuid;

alter table public.incident_videos drop constraint if exists incident_videos_device_id_sequence_key;
alter table public.incident_videos
  add constraint incident_videos_segment_id_key unique (segment_id);

create index incident_videos_session_sequence_idx on public.incident_videos (session_id, sequence);
create unique index incident_videos_legacy_device_sequence_key on public.incident_videos (device_id, sequence) where segment_id is null;

drop policy if exists "authorized users insert incident videos" on public.incident_videos;
create policy "authorized users insert incident videos" on public.incident_videos for insert to authenticated
with check (
  public.can_access_device(workspace_id, device_id) and
  exists (
    select 1 from public.fingerprints f
    where f.id = fingerprint_id
      and f.device_id = incident_videos.device_id
      and f.session_id = incident_videos.session_id
      and f.segment_id = incident_videos.segment_id
      and f.sequence = incident_videos.sequence
  )
);

grant select, insert on public.capture_sessions to authenticated;
grant update (ended_at) on public.capture_sessions to authenticated;

alter publication supabase_realtime add table public.capture_sessions;
notify pgrst, 'reload schema';
