create or replace function public.bootstrap_workspace(workspace_name text default 'My Forensics Lab')
returns uuid language plpgsql security definer set search_path = public as $$
declare new_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select workspace_id into new_workspace_id from public.workspace_members where user_id = auth.uid() limit 1;
  if new_workspace_id is not null then return new_workspace_id; end if;
  insert into public.workspaces (name) values (workspace_name) returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, auth.uid(), 'admin');
  return new_workspace_id;
end;
$$;

grant execute on function public.bootstrap_workspace(text) to authenticated;

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do update set public = false;

create policy "authenticated users read owned evidence objects"
on storage.objects for select to authenticated
using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated users upload owned evidence objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated users update owned evidence objects"
on storage.objects for update to authenticated
using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
