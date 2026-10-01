-- Timestamp aligned with the applied remote migration.
create table public.verification_attempts (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  status text not null,
  kind text not null,
  name text not null default '',
  details jsonb not null default '{}'::jsonb
);
alter table public.verification_attempts enable row level security;
create policy "members read verification attempts" on public.verification_attempts for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "members append own verification attempts" on public.verification_attempts for insert to authenticated
with check (actor_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
grant select, insert on public.verification_attempts to authenticated;
create index verification_attempts_workspace_time_idx on public.verification_attempts(workspace_id, created_at desc);
create index verification_attempts_actor_idx on public.verification_attempts(actor_id);

alter table public.fingerprints add column perceptual jsonb, add column perceptual_hash text;
alter table public.fingerprints drop constraint fingerprints_signed_evidence_check;
alter table public.fingerprints add constraint fingerprints_signed_evidence_check check (
  version = 0 or (
    version in (1,2,3) and bytes >= 0 and chain_hash ~ '^[0-9a-f]{64}$'
    and signature is not null and length(signature) > 20 and signature_algorithm = 'ECDSA_P256_SHA256'
    and (version = 1 or (session_id is not null and segment_id is not null))
    and (version < 3 or (perceptual is not null and perceptual_hash ~ '^[0-9a-f]{64}$'))
  )
);
