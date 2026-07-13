-- Bucket privé des copies photographiées.
insert into storage.buckets (id, name, public)
values ('copies', 'copies', false)
on conflict (id) do nothing;

-- Policies Storage : un parent n'accède qu'aux objets sous son propre préfixe
-- (1er segment de chemin = son auth.uid()). storage.objects a déjà la RLS activée.
create policy copies_parent_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'copies' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy copies_parent_select on storage.objects
  for select to authenticated
  using (bucket_id = 'copies' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy copies_parent_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'copies' and (storage.foldername(name))[1] = (auth.uid())::text);

-- Statuts d'une soumission (les statuts de correction sont posés dès maintenant
-- pour éviter un alter type en 2b ; 2a ne pose que 'envoye').
create type public.submission_statut as enum ('envoye','correction','corrige','echec');

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  homework_id uuid not null references public.homeworks (id) on delete cascade,
  photo_paths text[] not null default '{}',
  statut public.submission_statut not null default 'envoye',
  erreur text,
  created_at timestamptz not null default now()
);
create index submissions_parent_idx on public.submissions (parent_id);
create index submissions_homework_idx on public.submissions (homework_id);

alter table public.submissions enable row level security;

-- child ownership dans WITH CHECK (même durcissement que 1B).
create policy submissions_own on public.submissions
  for all using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (select 1 from public.children c
                where c.id = child_id and c.parent_id = auth.uid())
  );

grant select, insert, update, delete on public.submissions to authenticated;
