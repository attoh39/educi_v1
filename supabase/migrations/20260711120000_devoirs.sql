-- Statuts de génération
create type public.homework_statut as enum ('en_attente','generation','pret','echec');

-- Saisie du parent (mode primaire : un message unique)
create table public.homework_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  mode text not null check (mode in ('primaire','secondaire')),
  contenu jsonb not null,
  statut public.homework_statut not null default 'en_attente',
  erreur text,
  created_at timestamptz not null default now()
);
create index homework_requests_parent_idx on public.homework_requests (parent_id);
create index homework_requests_child_idx on public.homework_requests (child_id);

-- Devoir généré (exercices imprimés ; corrigé stocké mais non imprimé)
create table public.homeworks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.homework_requests (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  exercices jsonb not null,
  corrige jsonb not null,
  profil text not null,
  prompt_version text not null,
  modele text not null,
  cout_tokens_entree integer not null default 0,
  cout_tokens_sortie integer not null default 0,
  created_at timestamptz not null default now()
);
create index homeworks_parent_idx on public.homeworks (parent_id);
create index homeworks_child_idx on public.homeworks (child_id);

-- Compteur de génération par enfant et semaine ISO
create table public.usage_quotas (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  semaine_iso text not null check (semaine_iso ~ '^\d{4}-W\d{2}$'),
  generations integer not null default 0,
  unique (child_id, semaine_iso)
);
create index usage_quotas_parent_idx on public.usage_quotas (parent_id);

-- RLS : isolation par parent
alter table public.homework_requests enable row level security;
alter table public.homeworks enable row level security;
alter table public.usage_quotas enable row level security;

create policy homework_requests_own on public.homework_requests
  for all using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (select 1 from public.children c
                where c.id = child_id and c.parent_id = auth.uid())
  );
create policy homeworks_own on public.homeworks
  for all using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (select 1 from public.children c
                where c.id = child_id and c.parent_id = auth.uid())
  );
-- child ownership in WITH CHECK: without it, a parent could squat another
-- child's unique(child_id, semaine_iso) quota slot via incrementer_quota and
-- block that child's real parent (denial of service).
create policy usage_quotas_own on public.usage_quotas
  for all using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (select 1 from public.children c
                where c.id = child_id and c.parent_id = auth.uid())
  );

grant select, insert, update, delete on public.homework_requests to authenticated;
grant select, insert, update, delete on public.homeworks to authenticated;
grant select, insert, update, delete on public.usage_quotas to authenticated;

-- Incrément atomique du quota (security invoker : RLS s'applique via auth.uid()).
-- Retourne le nombre de générations APRÈS incrément.
create or replace function public.incrementer_quota(
  p_child_id uuid,
  p_semaine_iso text
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
begin
  insert into public.usage_quotas (parent_id, child_id, semaine_iso, generations)
  values (auth.uid(), p_child_id, p_semaine_iso, 1)
  on conflict (child_id, semaine_iso)
  do update set generations = public.usage_quotas.generations + 1
  returning generations into v_total;
  return v_total;
end;
$$;
