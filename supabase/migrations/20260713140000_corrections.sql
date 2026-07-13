-- Compteur de corrections séparé (par enfant et semaine).
alter table public.usage_quotas add column corrections integer not null default 0;

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  homework_id uuid not null references public.homeworks (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  note numeric(4,1),
  appreciation text not null,
  details jsonb not null,
  modele text not null,
  prompt_version text not null,
  cout_tokens_entree integer not null default 0,
  cout_tokens_sortie integer not null default 0,
  created_at timestamptz not null default now()
);
create index corrections_parent_idx on public.corrections (parent_id);
create index corrections_submission_idx on public.corrections (submission_id);

alter table public.corrections enable row level security;
create policy corrections_own on public.corrections
  for all using (parent_id = auth.uid())
  with check (
    parent_id = auth.uid()
    and exists (select 1 from public.children c
                where c.id = child_id and c.parent_id = auth.uid())
  );
grant select, insert, update, delete on public.corrections to authenticated;

-- Incrément atomique du quota de corrections (retourne le total après incrément).
create or replace function public.incrementer_correction(
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
  insert into public.usage_quotas (parent_id, child_id, semaine_iso, generations, corrections)
  values (auth.uid(), p_child_id, p_semaine_iso, 0, 1)
  on conflict (child_id, semaine_iso)
  do update set corrections = public.usage_quotas.corrections + 1
  returning corrections into v_total;
  return v_total;
end;
$$;
