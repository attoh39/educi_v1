create type public.maitrise_niveau as enum ('acquis', 'en_cours', 'fragile');

-- Niveau courant par compétence.
create table public.skill_records (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  matiere text not null,
  competence text not null,
  maitrise public.maitrise_niveau not null,
  observations integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (child_id, matiere, competence)
);
create index skill_records_child_idx on public.skill_records (child_id);

-- Historique daté (append-only).
create table public.skill_events (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  correction_id uuid not null references public.corrections (id) on delete cascade,
  matiere text not null,
  competence text not null,
  maitrise public.maitrise_niveau not null,
  created_at timestamptz not null default now()
);
create index skill_events_child_idx on public.skill_events (child_id, matiere);

alter table public.skill_records enable row level security;
alter table public.skill_events enable row level security;

create policy skill_records_own on public.skill_records
  for all using (parent_id = auth.uid())
  with check (parent_id = auth.uid()
    and exists (select 1 from public.children c where c.id = child_id and c.parent_id = auth.uid()));
create policy skill_events_own on public.skill_events
  for all using (parent_id = auth.uid())
  with check (parent_id = auth.uid()
    and exists (select 1 from public.children c where c.id = child_id and c.parent_id = auth.uid()));

grant select, insert, update, delete on public.skill_records to authenticated;
grant select, insert, update, delete on public.skill_events to authenticated;

-- Enregistre une compétence observée : event daté + upsert du niveau courant.
create or replace function public.enregistrer_competence(
  p_child_id uuid,
  p_correction_id uuid,
  p_matiere text,
  p_competence text,
  p_maitrise public.maitrise_niveau
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.skill_events (parent_id, child_id, correction_id, matiere, competence, maitrise)
  values (auth.uid(), p_child_id, p_correction_id, p_matiere, p_competence, p_maitrise);

  insert into public.skill_records (parent_id, child_id, matiere, competence, maitrise)
  values (auth.uid(), p_child_id, p_matiere, p_competence, p_maitrise)
  on conflict (child_id, matiere, competence)
  do update set
    maitrise = excluded.maitrise,
    observations = public.skill_records.observations + 1,
    updated_at = now();
end;
$$;
