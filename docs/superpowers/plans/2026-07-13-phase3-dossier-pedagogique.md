# EduCI 3 — Dossier pédagogique : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire la mémoire pédagogique de l'enfant : chaque correction émet des compétences (même appel Claude) qui alimentent `skill_records` (niveau courant) et `skill_events` (historique), consultables sur une page « Dossier ».

**Architecture:** Extension du schéma de correction (champ `competences`, prompt v2). Deux tables + RPC `enregistrer_competence`. `correct-submission` appelle la RPC (best-effort) après avoir persisté la correction. Client : API de lecture + page Dossier groupée par matière.

**Tech Stack:** React + Vite + TS strict, Vitest + RTL, Deno, zod, Supabase. Branche `phase-3`. Stack locale avec storage ; `test:rls` en séquentiel. Node 24, Deno.

---

## Structure de fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `supabase/migrations/20260713160000_dossier.sql` | tables + enum + RPC | créé |
| `supabase/tests/rls-dossier.test.ts` | isolation + RPC | créé |
| `src/features/correction/schema.ts` (+test) | + `competences` | modifié |
| `supabase/functions/_shared/correction.ts` (+test) | + `competences`, profil v2 | modifié |
| `supabase/functions/correct-submission/index.ts` (+handler.test.ts) | appel RPC compétences | modifié |
| `src/features/dossier/api.ts` (+test) | lecture skill_records | créé |
| `src/i18n/fr.ts` | + section `dossier` | modifié |
| `src/features/dossier/DossierPage.tsx` (+test) | vue dossier | créé |
| `src/routes.tsx`, `src/features/children/ChildrenPage.tsx` | route + lien | modifié |
| `src/lib/database.types.ts` | régénéré | modifié |

---

### Task 1 : Migration — skill_records, skill_events, RPC

**Files:**
- Create: `supabase/migrations/20260713160000_dossier.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260713160000_dossier.sql` :
```sql
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
```

- [ ] **Step 2 : Appliquer, linter, régénérer**

Run: `npx supabase db reset` (avertissement storage = bruit) ; `npx supabase db lint` → `No schema errors found`.
Run: `npx supabase gen types typescript --local > src/lib/database.types.ts` ; vérifie `skill_records` présent.
Run: `npm run typecheck` → PASS.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/20260713160000_dossier.sql src/lib/database.types.ts
git commit -m "feat: tables skill_records/skill_events et RPC enregistrer_competence"
```

---

### Task 2 : Tests d'isolation dossier + RPC

**Files:**
- Create: `supabase/tests/rls-dossier.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `supabase/tests/rls-dossier.test.ts` :
```ts
import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function parentAvecCorrection(tag: string) {
  const email = `${tag}-${Date.now()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await client.auth.signInWithPassword({ email, password });
  const id = sess!.user!.id;
  const { data: childId } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'K', p_prenoms: 'L', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: 'CP1', p_etablissement: 'EPP', p_systeme: 'IVOIRIEN', p_matieres: ['Français'],
  });
  const enrollmentId = (await client.from('enrollments').select('id').eq('child_id', childId).single()).data!.id;
  const { data: req } = await client.from('homework_requests').insert({
    parent_id: id, child_id: childId, enrollment_id: enrollmentId, mode: 'primaire', contenu: { message: 'x' },
  }).select('id').single();
  const { data: hw } = await client.from('homeworks').insert({
    request_id: req!.id, parent_id: id, child_id: childId, enrollment_id: enrollmentId,
    exercices: { matieres: [] }, corrige: [], profil: 'cp_ce1', prompt_version: 'v1', modele: 'claude-sonnet-5',
  }).select('id').single();
  const { data: sub } = await client.from('submissions').insert({
    parent_id: id, child_id: childId, homework_id: hw!.id, photo_paths: [`${id}/x/y/z.jpg`],
  }).select('id').single();
  const { data: corr } = await client.from('corrections').insert({
    submission_id: sub!.id, homework_id: hw!.id, parent_id: id, child_id: childId,
    appreciation: 'ok', details: [], modele: 'claude-sonnet-5', prompt_version: 'correction-v2',
  }).select('id').single();
  return { client, id, childId: childId as string, correctionId: corr!.id as string };
}

describe('Isolation du dossier pédagogique', () => {
  let a: Awaited<ReturnType<typeof parentAvecCorrection>>;
  let b: Awaited<ReturnType<typeof parentAvecCorrection>>;

  beforeAll(async () => {
    a = await parentAvecCorrection('sa');
    b = await parentAvecCorrection('sb');
  });

  it('enregistrer_competence crée un event et upsert le record (observations incrémentées)', async () => {
    await a.client.rpc('enregistrer_competence', {
      p_child_id: a.childId, p_correction_id: a.correctionId, p_matiere: 'Français', p_competence: 'syllabes', p_maitrise: 'en_cours',
    });
    await a.client.rpc('enregistrer_competence', {
      p_child_id: a.childId, p_correction_id: a.correctionId, p_matiere: 'Français', p_competence: 'syllabes', p_maitrise: 'acquis',
    });
    const { data: rec } = await a.client.from('skill_records').select('maitrise, observations')
      .eq('child_id', a.childId).eq('matiere', 'Français').eq('competence', 'syllabes').single();
    expect(rec).toMatchObject({ maitrise: 'acquis', observations: 2 });
    const { data: evts } = await a.client.from('skill_events').select('id').eq('child_id', a.childId);
    expect(evts).toHaveLength(2);
  });

  it('le parent B ne voit pas le dossier de A', async () => {
    const { data: rec } = await b.client.from('skill_records').select('*');
    expect(rec).toHaveLength(0);
    const { data: evt } = await b.client.from('skill_events').select('*');
    expect(evt).toHaveLength(0);
  });

  it('B ne peut pas enregistrer une compétence pour l’enfant de A', async () => {
    const { error } = await b.client.rpc('enregistrer_competence', {
      p_child_id: a.childId, p_correction_id: a.correctionId, p_matiere: 'Français', p_competence: 'x', p_maitrise: 'acquis',
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2 : Exécuter**

Run: `npm run test:rls`
Expected: socle 8 + devoirs 6 + copies 4 + corrections 3 + dossier 3 = **24 tests** PASS.

- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/rls-dossier.test.ts
git commit -m "test: isolation RLS du dossier et RPC enregistrer_competence"
```

---

### Task 3 : Champ competences — schéma client (TDD)

**Files:**
- Modify: `src/features/correction/schema.ts`, `src/features/correction/schema.test.ts`

- [ ] **Step 1 : Étendre le test**

Dans `src/features/correction/schema.test.ts`, ajouter le champ `competences` au fixture `valide` (`competences: [{ matiere: 'Français', libelle: 'syllabes', maitrise: 'en_cours' }]`) et un test :
```ts
  it('accepte des competences vides', () => {
    expect(correctionSchema.safeParse({ ...valide, competences: [] }).success).toBe(true);
  });
  it('refuse une maitrise inconnue', () => {
    const x = structuredClone(valide);
    (x.competences[0] as { maitrise: string }).maitrise = 'super';
    expect(correctionSchema.safeParse(x).success).toBe(false);
  });
```
(Ajouter `competences` au fixture `valide` en tête de fichier.)

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/correction/schema`
Expected: FAIL (competences non validé, ou maitrise acceptée à tort).

- [ ] **Step 3 : Implémenter**

Dans `src/features/correction/schema.ts`, ajouter après `STATUTS_EXERCICE` :
```ts
export const MAITRISES = ['acquis', 'en_cours', 'fragile'] as const;

const competenceSchema = z.object({
  matiere: z.string(),
  libelle: z.string(),
  maitrise: z.enum(MAITRISES),
});
```
et dans `correctionSchema`, ajouter le champ :
```ts
  competences: z.array(competenceSchema),
```
Ajouter l'export de type : `export type Maitrise = (typeof MAITRISES)[number];`

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/correction/schema && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/correction/schema.ts src/features/correction/schema.test.ts
git commit -m "feat: champ competences dans le schéma de correction client"
```

---

### Task 4 : competences + profil v2 (module Edge) (TDD Deno)

**Files:**
- Modify: `supabase/functions/_shared/correction.ts`, `supabase/functions/_shared/correction.test.ts`

- [ ] **Step 1 : Étendre le test**

Dans `supabase/functions/_shared/correction.test.ts`, ajouter :
```ts
Deno.test('correctionSchema accepte competences', () => {
  const r = correctionSchema.safeParse({
    appreciation: 'ok', details: [],
    competences: [{ matiere: 'Français', libelle: 'syllabes', maitrise: 'acquis' }],
  });
  assert(r.success);
});

Deno.test('profilCorrection mentionne les compétences', () => {
  assert(profilCorrection('primaire').includes('compétence') || profilCorrection('primaire').includes('notion'));
});
```
Et modifier le test `PROMPT_VERSION_CORRECTION` : `assertEquals(PROMPT_VERSION_CORRECTION, 'correction-v2');`

- [ ] **Step 2 : Vérifier l'échec**

Run: `deno test --node-modules-dir=none supabase/functions/_shared/correction.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Dans `supabase/functions/_shared/correction.ts` :
- `PROMPT_VERSION_CORRECTION` → `'correction-v2'`.
- Ajouter après `STATUTS_EXERCICE` : `export const MAITRISES = ['acquis', 'en_cours', 'fragile'] as const;`
- Dans `correctionSchema`, ajouter le champ :
```ts
  competences: z.array(z.object({
    matiere: z.string().min(1),
    libelle: z.string().min(1),
    maitrise: z.enum(MAITRISES),
  })),
```
- Dans `CORRECTION_JSON_SCHEMA.properties`, ajouter :
```ts
    competences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matiere: { type: 'string' },
          libelle: { type: 'string' },
          maitrise: { type: 'string', enum: [...MAITRISES] },
        },
        required: ['matiere', 'libelle', 'maitrise'],
      },
    },
```
et ajouter `'competences'` au tableau `required` de l'objet racine.
- Dans `COMMUN`, ajouter une règle :
```
- Identifie 1 à 3 compétences ou notions clés par matière (libellés courts, ex. "additions jusqu'à 100", "accord du participe passé") dans "competences", avec leur maîtrise : "acquis", "en_cours" ou "fragile".
```

- [ ] **Step 4 : Vérifier**

Run: `deno test --node-modules-dir=none supabase/functions/_shared/correction.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/_shared/correction.ts supabase/functions/_shared/correction.test.ts
git commit -m "feat: compétences et profil de correction v2 (module partagé)"
```

---

### Task 5 : correct-submission enregistre les compétences

**Files:**
- Modify: `supabase/functions/correct-submission/index.ts`, `supabase/functions/correct-submission/handler.test.ts`

- [ ] **Step 1 : Modifier le handler**

Dans `supabase/functions/correct-submission/index.ts` :
- Dans l'insert `corrections`, remplacer `.select('note, appreciation, details')` par `.select('id, note, appreciation, details')`.
- Après la ligne `await supabase.rpc('incrementer_correction', …);`, insérer la boucle d'enregistrement des compétences (best-effort) :
```ts
  for (const comp of parsed.data.competences) {
    try {
      await supabase.rpc('enregistrer_competence', {
        p_child_id: sub.child_id, p_correction_id: correction.id,
        p_matiere: comp.matiere, p_competence: comp.libelle, p_maitrise: comp.maitrise,
      });
    } catch (_e) {
      // best-effort : l'échec de l'enregistrement n'annule pas la correction.
    }
  }
```

- [ ] **Step 2 : Étendre le test d'intégration**

Dans `supabase/functions/correct-submission/handler.test.ts` :
- Dans `CORRECTION_FIXE`, ajouter `competences: [{ matiere: 'Français', libelle: 'syllabes', maitrise: 'en_cours' }]`.
- À la fin du test « corrige une soumission et persiste la correction », après la vérif du statut `corrige`, ajouter :
```ts
    const { data: rec } = await client.from('skill_records').select('competence, maitrise').eq('child_id', childId);
    assertEquals(rec?.[0]?.competence, 'syllabes');
```
(`childId` est déjà retourné par `parentAvecSoumission`.)

- [ ] **Step 3 : Exécuter**

Récupère les clés via `npx supabase status -o env`. Puis :
```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<anon> SUPABASE_SERVICE_ROLE_KEY=<service_role> \
deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/correct-submission/handler.test.ts
```
Expected: 2 tests PASS (dont l'assertion `skill_records`). Supprime un éventuel `deno.lock` racine avant commit.

- [ ] **Step 4 : Commit**

```bash
git add supabase/functions/correct-submission
git commit -m "feat: correct-submission alimente le dossier pédagogique (compétences)"
```

---

### Task 6 : API dossier + i18n (TDD)

**Files:**
- Create: `src/features/dossier/api.ts`, `src/features/dossier/api.test.ts`
- Modify: `src/i18n/fr.ts`

- [ ] **Step 1 : Test**

Créer `src/features/dossier/api.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));

import { listerCompetences } from './api';

beforeEach(() => vi.clearAllMocks());

describe('listerCompetences', () => {
  it('liste les compétences d’un enfant triées par matière', async () => {
    const order2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const order1 = vi.fn().mockReturnValue({ order: order2 });
    const eq = vi.fn().mockReturnValue({ order: order1 });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    const data = await listerCompetences('c1');
    expect(data).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('skill_records');
    expect(eq).toHaveBeenCalledWith('child_id', 'c1');
    expect(order1).toHaveBeenCalledWith('matiere');
    expect(order2).toHaveBeenCalledWith('competence');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/dossier/api`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/dossier/api.ts` :
```ts
import { supabase } from '../../lib/supabase';
import type { Maitrise } from '../correction/schema';

export type SkillRecord = {
  id: string;
  matiere: string;
  competence: string;
  maitrise: Maitrise;
  observations: number;
  updated_at: string;
};

export async function listerCompetences(childId: string): Promise<SkillRecord[]> {
  const { data, error } = await supabase
    .from('skill_records')
    .select('id, matiere, competence, maitrise, observations, updated_at')
    .eq('child_id', childId)
    .order('matiere')
    .order('competence');
  if (error) throw error;
  return (data ?? []) as SkillRecord[];
}
```

- [ ] **Step 4 : i18n**

Dans `src/i18n/fr.ts`, ajouter après la section `correction` (avant `} as const;`) :
```ts
  dossier: {
    titre: 'Dossier pédagogique',
    lien: 'Dossier',
    aucun: 'Aucune donnée : faites corriger des copies pour construire le dossier.',
    acquis: 'Acquis',
    enCours: 'En cours',
    fragile: 'Fragile',
    observations: 'observation(s)',
  },
```

- [ ] **Step 5 : Vérifier**

Run: `npm run test:run -- src/features/dossier/api && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/features/dossier/api.ts src/features/dossier/api.test.ts src/i18n/fr.ts
git commit -m "feat: API du dossier pédagogique et textes UI"
```

---

### Task 7 : Page Dossier + route + lien (TDD)

**Files:**
- Create: `src/features/dossier/DossierPage.tsx`, `src/features/dossier/DossierPage.test.tsx`
- Modify: `src/routes.tsx`, `src/features/children/ChildrenPage.tsx`

- [ ] **Step 1 : Test**

Créer `src/features/dossier/DossierPage.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const mockLister = vi.fn();
vi.mock('./api', () => ({ listerCompetences: (...a: unknown[]) => mockLister(...a) }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1' }),
}));

import { DossierPage } from './DossierPage';

function rendre() { return render(<MemoryRouter><DossierPage /></MemoryRouter>); }
beforeEach(() => vi.clearAllMocks());

it('groupe les compétences par matière avec leur maîtrise', async () => {
  mockLister.mockResolvedValue([
    { id: '1', matiere: 'Français', competence: 'syllabes', maitrise: 'acquis', observations: 2, updated_at: '2026-07-13T10:00:00Z' },
    { id: '2', matiere: 'Mathématiques', competence: 'additions', maitrise: 'fragile', observations: 1, updated_at: '2026-07-13T10:00:00Z' },
  ]);
  rendre();
  expect(await screen.findByText('Français')).toBeInTheDocument();
  expect(screen.getByText('syllabes')).toBeInTheDocument();
  expect(screen.getByText('Acquis')).toBeInTheDocument();
  expect(screen.getByText('Fragile')).toBeInTheDocument();
});

it('affiche l’état vide', async () => {
  mockLister.mockResolvedValue([]);
  rendre();
  expect(await screen.findByText(/Aucune donnée/)).toBeInTheDocument();
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/dossier/DossierPage`
Expected: FAIL.

- [ ] **Step 3 : Implémenter la page**

Créer `src/features/dossier/DossierPage.tsx` :
```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import type { Maitrise } from '../correction/schema';
import { listerCompetences, type SkillRecord } from './api';

const BADGE: Record<Maitrise, { texte: string; classe: string }> = {
  acquis: { texte: fr.dossier.acquis, classe: 'bg-green-100 text-green-700' },
  en_cours: { texte: fr.dossier.enCours, classe: 'bg-amber-100 text-amber-700' },
  fragile: { texte: fr.dossier.fragile, classe: 'bg-red-100 text-red-700' },
};

export function DossierPage() {
  const { childId } = useParams();
  const [records, setRecords] = useState<SkillRecord[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    listerCompetences(childId).then(setRecords).catch(() => setErreur(fr.commun.erreurInconnue));
  }, [childId]);

  const parMatiere = new Map<string, SkillRecord[]>();
  for (const r of records ?? []) {
    const liste = parMatiere.get(r.matiere) ?? [];
    liste.push(r);
    parMatiere.set(r.matiere, liste);
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.dossier.titre}</h2>
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
      {records === null && !erreur && <p className="text-slate-500">{fr.commun.chargement}</p>}
      {records?.length === 0 && <p className="text-slate-500">{fr.dossier.aucun}</p>}
      {[...parMatiere.entries()].map(([matiere, liste]) => (
        <div key={matiere} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 font-bold text-slate-700">{matiere}</h3>
          <ul className="space-y-2">
            {liste.map((r) => {
              const badge = BADGE[r.maitrise];
              return (
                <li key={r.id} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">
                    {r.competence} <span className="text-slate-400">· {r.observations} {fr.dossier.observations}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.classe}`}>{badge.texte}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4 : Route + lien**

Dans `src/routes.tsx`, importer `DossierPage` et ajouter (après `/enfants/:childId/devoirs`) :
```tsx
          { path: '/enfants/:childId/dossier', element: <DossierPage /> },
```
Dans `src/features/children/ChildrenPage.tsx`, après le lien « Devoirs » (dans le même `<li>`), ajouter :
```tsx
              {inscription && (
                <Link
                  to={`/enfants/${e.id}/dossier`}
                  className="mt-2 ml-2 inline-block rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  {fr.dossier.lien}
                </Link>
              )}
```

- [ ] **Step 5 : Vérifier**

Run: `npm run test:run -- src/features/dossier/DossierPage && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/features/dossier/DossierPage.tsx src/features/dossier/DossierPage.test.tsx src/routes.tsx src/features/children/ChildrenPage.tsx
git commit -m "feat: page Dossier pédagogique par enfant"
```

---

### Task 8 : Vérification finale et documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1 : Vérification complète**

Run: `npm run lint && npm run typecheck && npm run test:run && npm run build`
Expected: tout PASS.
Run: `npm run test:rls` → 24 tests.
Run: `deno test --node-modules-dir=none supabase/functions/_shared/correction.test.ts` → PASS.

- [ ] **Step 2 : README**

Dans `README.md`, après la section « Correction IA (2b) », ajouter :
```markdown

### Dossier pédagogique (Plan 3)

Chaque correction émet (même appel Claude) des compétences par matière avec leur
maîtrise (acquis / en cours / fragile). L'Edge Function `correct-submission` les
enregistre via `enregistrer_competence` dans `skill_records` (niveau courant) et
`skill_events` (historique daté). Le parent consulte le « Dossier » d'un enfant.
Ces données alimenteront le Coach IA et le tableau de bord (plans ultérieurs).
```

- [ ] **Step 3 : Commit**

```bash
git add README.md
git commit -m "docs: dossier pédagogique (compétences, skill_records)"
```

---

## Critère de fin

Après une correction, les compétences détectées alimentent `skill_records` et
`skill_events` ; le parent ouvre le dossier d'un enfant et voit les compétences
groupées par matière avec leur maîtrise ; un autre parent ne voit jamais ces
données (RLS) ; l'échec de l'enregistrement n'annule pas la correction.
Vérification complète verte.

## Self-review (writing-plans)

- **Couverture spec** : tables + RPC (T1), tests isolation + RPC (T2), schéma
  client competences (T3), module Edge competences + profil v2 (T4),
  correct-submission enregistre (T5), api dossier + i18n (T6), page Dossier +
  route + lien (T7), vérif + doc (T8). Couvre toutes les sections du design.
- **Types** : `Maitrise`/`MAITRISES` (T3) consommés par l'api (T6) et la page
  (T7) ; `competences` du schéma (T3/T4) par correct-submission (T5) ;
  `SkillRecord`/`listerCompetences` (T6) par la page (T7). Cohérent.
- **Pas de placeholder** : chaque étape porte le code réel.
- **Note d'exécution** : `test:rls` séquentiel (déjà configuré) ; storage requis
  pour T2 et T5.
