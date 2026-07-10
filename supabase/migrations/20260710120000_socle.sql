-- Types énumérés
create type public.classe_niveau as enum (
  'PS','MS','GS','CP1','CP2','CE1','CE2','CM1','CM2',
  '6EME','5EME','4EME','3EME','SECONDE','PREMIERE','TERMINALE'
);
create type public.systeme_educatif as enum ('IVOIRIEN','FRANCAIS','AUTRE');

-- Comptes parents (1-1 avec auth.users)
create table public.parents (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- Profil permanent de l'enfant : ne disparaît jamais
create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  nom text not null,
  prenoms text not null,
  date_naissance date not null,
  sexe text not null check (sexe in ('M','F')),
  photo_path text,
  created_at timestamptz not null default now()
);
create index children_parent_idx on public.children (parent_id);

-- Une inscription par enfant et par année scolaire
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  annee_scolaire text not null check (annee_scolaire ~ '^\d{4}-\d{4}$'),
  classe public.classe_niveau not null,
  etablissement text not null default '',
  systeme public.systeme_educatif not null default 'IVOIRIEN',
  matieres text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (child_id, annee_scolaire)
);
create index enrollments_parent_idx on public.enrollments (parent_id);
create unique index one_active_enrollment_per_child
  on public.enrollments (child_id) where is_active;

-- Création automatique du compte parent à l'inscription auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.parents (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Création atomique enfant + inscription (RLS s'applique : security invoker)
create or replace function public.create_child_with_enrollment(
  p_nom text,
  p_prenoms text,
  p_date_naissance date,
  p_sexe text,
  p_annee_scolaire text,
  p_classe public.classe_niveau,
  p_etablissement text,
  p_systeme public.systeme_educatif,
  p_matieres text[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_child_id uuid;
begin
  insert into public.children (parent_id, nom, prenoms, date_naissance, sexe)
  values (auth.uid(), p_nom, p_prenoms, p_date_naissance, p_sexe)
  returning id into v_child_id;

  insert into public.enrollments
    (child_id, parent_id, annee_scolaire, classe, etablissement, systeme, matieres)
  values
    (v_child_id, auth.uid(), p_annee_scolaire, p_classe, p_etablissement, p_systeme, p_matieres);

  return v_child_id;
end;
$$;

-- RLS : isolation stricte par parent
alter table public.parents enable row level security;
alter table public.children enable row level security;
alter table public.enrollments enable row level security;

create policy parents_select_own on public.parents
  for select using (id = auth.uid());
create policy parents_update_own on public.parents
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy children_own on public.children
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy enrollments_own on public.enrollments
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());
