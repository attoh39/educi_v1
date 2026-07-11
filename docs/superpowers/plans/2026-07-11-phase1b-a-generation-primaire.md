# EduCI Phase 1B-a — Génération de devoirs (mode primaire) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un parent du primaire de coller le message WhatsApp de l'enseignant et d'obtenir un devoir structuré adapté au niveau, imprimable en PDF, avec un quota hebdomadaire par enfant — la génération passant par une Edge Function Supabase qui appelle Claude Sonnet 5.

**Architecture:** Le client (React) envoie la saisie à l'Edge Function `generate-homework` (Deno) via `supabase.functions.invoke`. La fonction vérifie le quota (RLS, par enfant/semaine), sélectionne le profil pédagogique du cycle, appelle Claude Sonnet 5 en HTTP direct avec `output_config.format` (JSON structuré) + prompt caching sur le profil, valide la sortie avec zod, persiste `homeworks` et incrémente le quota. Le client rend le devoir en HTML/CSS imprimable et le met en cache IndexedDB.

**Tech Stack:** Supabase Edge Functions (Deno 2), Claude Sonnet 5 (`claude-sonnet-5`, HTTP `POST /v1/messages`, `anthropic-version: 2023-06-01`), zod (client + Deno via `npm:zod`), React 19 + Vite, `idb-keyval` pour IndexedDB, Vitest + RTL. Base : socle 1A (Supabase, auth, `children`/`enrollments`, `src/domain/classes.ts`).

**Prérequis :** socle 1A mergé sur `main`. Stack Supabase locale démarrée (`npx supabase start`). Node ≥ 22. Pour la vérification E2E avec un vrai devoir : une clé `ANTHROPIC_API_KEY` (dépense réelle) — les tests, eux, utilisent un faux serveur Claude local (aucune dépense).

**Hors de ce plan (reporté à 1B-b) :** mode secondaire (un champ par matière), profils collège/lycée, règles par matière, gabarit « contrôle ». Reporté plus tard : correction des copies, Coach IA, paiement.

---

## Contrat de données : le Devoir

Structure JSON produite par l'IA, validée par zod, persistée dans `homeworks.exercices` (+ `homeworks.corrige` séparé).

**Frontière de sécurité importante :** l'Edge Function connaît le devoir **complet** (`{ matieres, corrige }`) — schéma envoyé à Claude, validation, persistance. Le **client ne reçoit que la partie imprimable** (`{ matieres }`) : le corrigé reste stocké côté base et n'est jamais renvoyé au navigateur en 1B-a (une vue « corrigé » pour le parent est reportée). D'où deux types :
- Edge Function (`supabase/functions/_shared/devoir.ts`) : `Devoir = { matieres, corrige }` (complet).
- Client (`src/features/devoirs/schema.ts`) : `Devoir = { matieres }` (imprimable). Un commentaire dans chaque fichier renvoie à l'autre.

```
Devoir = {
  matieres: Array<{
    nom: string
    exercices: Array<{
      numero: number
      consigne: string
      type: 'ecriture' | 'qcm' | 'calcul' | 'appariement' | 'coloriage' | 'libre'
      items: string[]            // questions QCM, opérations… (vide si sans items)
      espaceReponse: 'lignes' | 'cadre' | 'aucun'
    }>
  }>
  corrige: Array<{ matiere: string; numero: number; reponse: string; explication: string }>
}
```

Pas de champ `illustration` en 1B-a (les illustrations SVG par thème sont reportées ; YAGNI pour la première mise en production du primaire — les gabarits réservent l'espace d'écriture, ce qui est l'essentiel).

---

## Structure de fichiers cible

```
supabase/
├── migrations/20260711120000_devoirs.sql        # tables + RLS + grants + RPC quota
├── functions/
│   ├── _shared/
│   │   ├── devoir.ts        # zod Devoir + JSON Schema pour output_config + type
│   │   ├── profils.ts       # profils pédagogiques par cycle (primaire)
│   │   └── claude.ts        # appel HTTP Claude Sonnet 5 (fetch), typed
│   └── generate-homework/
│       ├── index.ts         # Deno.serve : quota → profil → Claude → validation → persistance
│       └── handler.test.ts  # test d'intégration Deno (faux serveur Claude + Supabase local)
├── tests/rls-devoirs.test.ts                     # isolation RLS des nouvelles tables (Vitest node)
src/
├── domain/
│   ├── semaine.ts           # semaineIso(date) + GENERATIONS_PAR_SEMAINE
│   └── semaine.test.ts
├── features/devoirs/
│   ├── schema.ts            # zod Devoir côté client (rendu)
│   ├── schema.test.ts
│   ├── api.ts               # genererDevoir() + listerDevoirs()
│   ├── api.test.ts
│   ├── DevoirDocument.tsx   # rendu HTML/CSS imprimable
│   ├── DevoirDocument.test.tsx
│   ├── GenerateHomeworkPage.tsx
│   └── GenerateHomeworkPage.test.tsx
├── lib/devoirsCache.ts      # cache IndexedDB (idb-keyval)
└── i18n/fr.ts               # + section fr.devoirs (modifié)
```

---

### Task 1 : Migration — tables devoirs, RLS, grants, RPC quota

**Files:**
- Create: `supabase/migrations/20260711120000_devoirs.sql`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260711120000_devoirs.sql` :
```sql
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
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());
create policy homeworks_own on public.homeworks
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());
create policy usage_quotas_own on public.usage_quotas
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

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
```

- [ ] **Step 2 : Appliquer et linter**

Run: `npx supabase db reset`
Expected: les deux migrations s'appliquent sans erreur.
Run: `npx supabase db lint`
Expected: `No schema errors found`.

- [ ] **Step 3 : Vérifier que le test de synchronisation enum classe reste vert**

Run: `npm run test:run -- src/domain/classes.sqlsync`
Expected: PASS (la migration socle est inchangée).

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/20260711120000_devoirs.sql
git commit -m "feat: schéma des devoirs (requests, homeworks, quotas) avec RLS et RPC quota"
```

---

### Task 2 : Tests d'isolation RLS des nouvelles tables

**Files:**
- Create: `supabase/tests/rls-devoirs.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `supabase/tests/rls-devoirs.test.ts` :
```ts
import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function nouveauParentAvecEnfant(tag: string) {
  const email = `${tag}-${Date.now()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (e1) throw e1;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: childId, error: e2 } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'Kouassi', p_prenoms: 'Lamine', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: 'CP1', p_etablissement: 'EPP Cocody',
    p_systeme: 'IVOIRIEN', p_matieres: ['Français'],
  });
  if (e2) throw e2;
  const { data: enr } = await client.from('enrollments').select('id').eq('child_id', childId).single();
  return { client, id: data.user.id, childId: childId as string, enrollmentId: enr!.id as string };
}

describe('Isolation RLS des devoirs', () => {
  let a: Awaited<ReturnType<typeof nouveauParentAvecEnfant>>;
  let b: Awaited<ReturnType<typeof nouveauParentAvecEnfant>>;
  let requestAId: string;

  beforeAll(async () => {
    a = await nouveauParentAvecEnfant('da');
    b = await nouveauParentAvecEnfant('db');
    const { data, error } = await a.client.from('homework_requests').insert({
      parent_id: a.id, child_id: a.childId, enrollment_id: a.enrollmentId,
      mode: 'primaire', contenu: { message: 'Français : syllabes MA ME MI' },
    }).select('id').single();
    if (error) throw error;
    requestAId = data.id;
  });

  it('le parent B ne voit pas les demandes du parent A', async () => {
    const { data } = await b.client.from('homework_requests').select('*');
    expect(data).toHaveLength(0);
  });

  it('le parent B ne peut pas insérer une demande chez le parent A', async () => {
    const { error } = await b.client.from('homework_requests').insert({
      parent_id: a.id, child_id: a.childId, enrollment_id: a.enrollmentId,
      mode: 'primaire', contenu: { message: 'x' },
    });
    expect(error).not.toBeNull();
  });

  it('incrementer_quota crée puis incrémente pour le bon parent', async () => {
    const { data: t1, error: e1 } = await a.client.rpc('incrementer_quota', {
      p_child_id: a.childId, p_semaine_iso: '2026-W37',
    });
    expect(e1).toBeNull();
    expect(t1).toBe(1);
    const { data: t2 } = await a.client.rpc('incrementer_quota', {
      p_child_id: a.childId, p_semaine_iso: '2026-W37',
    });
    expect(t2).toBe(2);
  });

  it('le parent B ne voit pas les quotas du parent A', async () => {
    const { data } = await b.client.from('usage_quotas').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('le parent B ne voit pas le devoir du parent A', async () => {
    // le parent A crée un homework lié à sa request
    await a.client.from('homeworks').insert({
      request_id: requestAId, parent_id: a.id, child_id: a.childId,
      enrollment_id: a.enrollmentId, exercices: { matieres: [] }, corrige: [],
      profil: 'cp_ce1', prompt_version: 'v1', modele: 'claude-sonnet-5',
    });
    const { data } = await b.client.from('homeworks').select('*');
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : Exécuter (Node 24, stack démarrée)**

Run: `npm run test:rls`
Expected: la suite socle (8 tests) + la nouvelle suite devoirs (5 tests) passent.
(Si `npm run test:rls` ne cible qu'un fichier, vérifier que `vitest.rls.config.ts` inclut `supabase/tests/**/*.test.ts` — c'est déjà le cas.)

- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/rls-devoirs.test.ts
git commit -m "test: isolation RLS des tables de devoirs"
```

---

### Task 3 : Domaine — semaine ISO et quota de lancement (TDD)

**Files:**
- Create: `src/domain/semaine.ts`, `src/domain/semaine.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `src/domain/semaine.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { GENERATIONS_PAR_SEMAINE, semaineIso } from './semaine';

describe('semaineIso', () => {
  it('formate en AAAA-Www (semaine ISO, lundi comme premier jour)', () => {
    expect(semaineIso(new Date('2026-01-01'))).toBe('2026-W01'); // jeudi → semaine 1
    expect(semaineIso(new Date('2026-09-10'))).toBe('2026-W37');
    expect(semaineIso(new Date('2027-01-04'))).toBe('2027-W01'); // lundi
  });
  it('rattache les premiers jours de janvier à la dernière semaine de l’année précédente si besoin', () => {
    expect(semaineIso(new Date('2027-01-01'))).toBe('2026-W53'); // vendredi → semaine ISO 53 de 2026
  });
});

describe('GENERATIONS_PAR_SEMAINE', () => {
  it('définit un quota de lancement strictement positif', () => {
    expect(GENERATIONS_PAR_SEMAINE).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/domain/semaine`
Expected: FAIL — `./semaine` introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/domain/semaine.ts` :
```ts
/** Quota de génération par enfant et par semaine pendant la période de lancement. */
export const GENERATIONS_PAR_SEMAINE = 10;

/** Numéro de semaine ISO 8601 (lundi = premier jour) au format `AAAA-Www`. */
export function semaineIso(date: Date): string {
  // Copie en UTC pour un calcul indépendant du fuseau.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7; // dimanche (0) -> 7
  d.setUTCDate(d.getUTCDate() + 4 - jour); // jeudi de la semaine courante
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semaine).padStart(2, '0')}`;
}
```

- [ ] **Step 4 : Vérifier le passage**

Run: `npm run test:run -- src/domain/semaine`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/domain/semaine.ts src/domain/semaine.test.ts
git commit -m "feat: helper de semaine ISO et quota de génération de lancement"
```

---

### Task 4 : Schéma zod du devoir côté client (TDD)

**Files:**
- Create: `src/features/devoirs/schema.ts`, `src/features/devoirs/schema.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `src/features/devoirs/schema.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { devoirSchema } from './schema';

const valide = {
  matieres: [
    {
      nom: 'Français',
      exercices: [
        { numero: 1, consigne: 'Lis les syllabes.', type: 'ecriture', items: ['MA', 'ME'], espaceReponse: 'lignes' },
      ],
    },
  ],
  corrige: [{ matiere: 'Français', numero: 1, reponse: 'MA, ME', explication: 'Syllabes avec M.' }],
};

describe('devoirSchema', () => {
  it('accepte un devoir valide', () => {
    expect(devoirSchema.safeParse(valide).success).toBe(true);
  });
  it('refuse un type d’exercice inconnu', () => {
    const x = structuredClone(valide);
    (x.matieres[0].exercices[0] as { type: string }).type = 'dictée';
    expect(devoirSchema.safeParse(x).success).toBe(false);
  });
  it('refuse une matière sans exercices', () => {
    const x = structuredClone(valide);
    x.matieres[0].exercices = [];
    expect(devoirSchema.safeParse(x).success).toBe(false);
  });
  it('exige au moins une matière', () => {
    expect(devoirSchema.safeParse({ ...valide, matieres: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/schema`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/devoirs/schema.ts` :
```ts
import { z } from 'zod';

// Devoir IMPRIMABLE côté client (sans corrigé — voir la frontière de sécurité
// en tête de plan). Le contrat complet vit dans supabase/functions/_shared/devoir.ts.
export const TYPES_EXERCICE = ['ecriture', 'qcm', 'calcul', 'appariement', 'coloriage', 'libre'] as const;
export const ESPACES_REPONSE = ['lignes', 'cadre', 'aucun'] as const;

const exerciceSchema = z.object({
  numero: z.number().int().positive(),
  consigne: z.string().min(1),
  type: z.enum(TYPES_EXERCICE),
  items: z.array(z.string()),
  espaceReponse: z.enum(ESPACES_REPONSE),
});

export const devoirSchema = z.object({
  matieres: z
    .array(z.object({ nom: z.string().min(1), exercices: z.array(exerciceSchema).min(1) }))
    .min(1),
});

export type Devoir = z.infer<typeof devoirSchema>;
```
(Le corrigé n'apparaît pas dans le type client : il n'est jamais renvoyé au navigateur en 1B-a. Le fixture de test peut contenir une clé `corrige` — zod ignore les clés inconnues, les tests restent valides.)

- [ ] **Step 4 : Vérifier le passage**

Run: `npm run test:run -- src/features/devoirs/schema`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/devoirs/schema.ts src/features/devoirs/schema.test.ts
git commit -m "feat: schéma zod du devoir côté client"
```

---

### Task 5 : Edge Function — schéma partagé du devoir (zod + JSON Schema)

**Files:**
- Create: `supabase/functions/_shared/devoir.ts`

- [ ] **Step 1 : Implémenter le module partagé Deno**

Créer `supabase/functions/_shared/devoir.ts` :
```ts
import { z } from 'npm:zod@3';

// Contrat partagé avec le client : src/features/devoirs/schema.ts.
// Toute évolution doit être répercutée dans les deux fichiers.
export const TYPES_EXERCICE = ['ecriture', 'qcm', 'calcul', 'appariement', 'coloriage', 'libre'] as const;
export const ESPACES_REPONSE = ['lignes', 'cadre', 'aucun'] as const;

export const devoirSchema = z.object({
  matieres: z
    .array(
      z.object({
        nom: z.string().min(1),
        exercices: z
          .array(
            z.object({
              numero: z.number().int().positive(),
              consigne: z.string().min(1),
              type: z.enum(TYPES_EXERCICE),
              items: z.array(z.string()),
              espaceReponse: z.enum(ESPACES_REPONSE),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
  corrige: z.array(
    z.object({
      matiere: z.string().min(1),
      numero: z.number().int().positive(),
      reponse: z.string(),
      explication: z.string(),
    }),
  ),
});

export type Devoir = z.infer<typeof devoirSchema>;

// JSON Schema envoyé à Claude via output_config.format. Les contraintes non
// supportées par les sorties structurées (minLength, min…) sont volontairement
// omises ici ; la validation fine est faite par zod après réception.
export const DEVOIR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    matieres: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nom: { type: 'string' },
          exercices: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                numero: { type: 'integer' },
                consigne: { type: 'string' },
                type: { type: 'string', enum: [...TYPES_EXERCICE] },
                items: { type: 'array', items: { type: 'string' } },
                espaceReponse: { type: 'string', enum: [...ESPACES_REPONSE] },
              },
              required: ['numero', 'consigne', 'type', 'items', 'espaceReponse'],
            },
          },
        },
        required: ['nom', 'exercices'],
      },
    },
    corrige: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matiere: { type: 'string' },
          numero: { type: 'integer' },
          reponse: { type: 'string' },
          explication: { type: 'string' },
        },
        required: ['matiere', 'numero', 'reponse', 'explication'],
      },
    },
  },
  required: ['matieres', 'corrige'],
} as const;
```

- [ ] **Step 2 : Vérifier que Deno parse le module (types + imports)**

Run: `npx supabase functions new generate-homework` (crée l'ossature `supabase/functions/generate-homework/index.ts` — on la remplacera en Task 8 ; cette commande initialise aussi `supabase/functions/` et `deno.json` si absents).
Puis: `deno check supabase/functions/_shared/devoir.ts`
Expected: aucune erreur de type (Deno télécharge `npm:zod@3`).
(Si `deno` n'est pas dans le PATH : la stack Supabase embarque Deno ; installer Deno localement — https://deno.com — ou reporter la vérification `deno check` à la Task 8, où `supabase functions serve` compile le module.)

- [ ] **Step 3 : Commit**

```bash
git add supabase/functions/_shared/devoir.ts
git commit -m "feat: schéma partagé du devoir pour l'Edge Function (zod + JSON Schema)"
```

---

### Task 6 : Edge Function — profils pédagogiques du primaire

**Files:**
- Create: `supabase/functions/_shared/profils.ts`

- [ ] **Step 1 : Implémenter les profils**

Créer `supabase/functions/_shared/profils.ts` :
```ts
// Profils pédagogiques par cycle (primaire uniquement en 1B-a).
// Chaque profil est un bloc système STABLE (mis en cache côté Claude).
export const PROMPT_VERSION = 'primaire-v1';

export type CyclePrimaire = 'maternelle' | 'cp_ce1' | 'ce2_cm2';

const COMMUN = `Tu es un concepteur d'exercices scolaires pour la Côte d'Ivoire.
Tu produis un devoir à imprimer sur papier pour un enfant, à partir du contenu de cours fourni par le parent.
Règles générales :
- Réponds UNIQUEMENT avec un objet JSON conforme au schéma imposé, sans texte autour.
- Rédige en français, avec des consignes claires adaptées à l'âge.
- Regroupe les exercices par matière, dans l'ordre du message du parent.
- Numérote les exercices par matière en commençant à 1.
- Fournis systématiquement un corrigé complet dans "corrige".
- N'invente pas de matière absente du message du parent.`;

const PROFILS: Record<CyclePrimaire, string> = {
  maternelle: `${COMMUN}
Niveau : maternelle (3-5 ans). Privilégie l'observation, les couleurs, le graphisme,
les activités très courtes. Consignes de 1 phrase, à lire par le parent.
Utilise surtout les types "coloriage", "appariement" et "libre". espaceReponse le plus souvent "cadre".`,
  cp_ce1: `${COMMUN}
Niveau : CP1 à CE1 (6-8 ans). Utilise de très courtes consignes, des syllabes et des mots simples,
des additions/soustractions simples. Progressivité douce.
Types adaptés : "ecriture", "qcm", "calcul", "appariement". espaceReponse "lignes" pour l'écriture, "cadre" pour le calcul.`,
  ce2_cm2: `${COMMUN}
Niveau : CE2 à CM2 (8-11 ans). Consignes plus longues, exercices plus complexes,
phrases à compléter, opérations posées, petits problèmes.
Types adaptés : "ecriture", "qcm", "calcul", "libre". espaceReponse "lignes" ou "cadre" selon l'exercice.`,
};

export function profilPourCycle(cycle: string): { texte: string; cle: CyclePrimaire } | null {
  if (cycle === 'maternelle' || cycle === 'cp_ce1' || cycle === 'ce2_cm2') {
    return { texte: PROFILS[cycle], cle: cycle };
  }
  return null; // collège/lycée : hors périmètre 1B-a
}
```

- [ ] **Step 2 : Commit**

```bash
git add supabase/functions/_shared/profils.ts
git commit -m "feat: profils pédagogiques du primaire pour la génération"
```

---

### Task 7 : Edge Function — client Claude (HTTP, Sonnet 5)

**Files:**
- Create: `supabase/functions/_shared/claude.ts`

- [ ] **Step 1 : Implémenter le client Claude**

Créer `supabase/functions/_shared/claude.ts` :
```ts
// Appel HTTP direct à l'API Messages de Claude (Sonnet 5).
// Choix HTTP (plutôt que SDK) : contrôle total du corps, aucune surprise de
// typage du SDK sous Deno. output_config.format force un JSON conforme au schéma.
export const MODELE = 'claude-sonnet-5';

export type ResultatClaude =
  | { ok: true; json: unknown; tokensEntree: number; tokensSortie: number }
  | { ok: false; raison: 'refus' | 'tronque' | 'http' | 'json'; detail: string };

export async function genererJson(params: {
  systeme: string;
  message: string;
  jsonSchema: unknown;
  apiKey: string;
  baseUrl?: string; // surchargé par les tests pour pointer un faux serveur
}): Promise<ResultatClaude> {
  const base = params.baseUrl ?? 'https://api.anthropic.com';
  let reponse: Response;
  try {
    reponse = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: 8000,
        thinking: { type: 'disabled' },
        system: [
          { type: 'text', text: params.systeme, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: params.message }],
        output_config: {
          format: { type: 'json_schema', name: 'devoir', schema: params.jsonSchema },
        },
      }),
    });
  } catch (e) {
    return { ok: false, raison: 'http', detail: String(e) };
  }

  if (!reponse.ok) {
    return { ok: false, raison: 'http', detail: `HTTP ${reponse.status}` };
  }
  const data = await reponse.json();
  if (data.stop_reason === 'refusal') {
    return { ok: false, raison: 'refus', detail: data.stop_details?.explanation ?? 'refus' };
  }
  if (data.stop_reason === 'max_tokens') {
    return { ok: false, raison: 'tronque', detail: 'sortie tronquée (max_tokens)' };
  }
  const bloc = Array.isArray(data.content)
    ? data.content.find((b: { type: string }) => b.type === 'text')
    : null;
  if (!bloc?.text) {
    return { ok: false, raison: 'json', detail: 'aucun bloc texte' };
  }
  try {
    return {
      ok: true,
      json: JSON.parse(bloc.text),
      tokensEntree: data.usage?.input_tokens ?? 0,
      tokensSortie: data.usage?.output_tokens ?? 0,
    };
  } catch {
    return { ok: false, raison: 'json', detail: 'JSON invalide' };
  }
}
```

- [ ] **Step 2 : Commit**

```bash
git add supabase/functions/_shared/claude.ts
git commit -m "feat: client HTTP Claude Sonnet 5 pour l'Edge Function"
```

---

### Task 8 : Edge Function — orchestration generate-homework + test d'intégration

**Files:**
- Create/replace: `supabase/functions/generate-homework/index.ts`
- Create: `supabase/functions/generate-homework/handler.test.ts`

- [ ] **Step 1 : Écrire le handler**

Remplacer `supabase/functions/generate-homework/index.ts` par :
```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { devoirSchema, DEVOIR_JSON_SCHEMA } from '../_shared/devoir.ts';
import { profilPourCycle, PROMPT_VERSION } from '../_shared/profils.ts';
import { genererJson, MODELE } from '../_shared/claude.ts';

const GENERATIONS_PAR_SEMAINE = 10;

function semaineIso(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semaine).padStart(2, '0')}`;
}

function reponseJson(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return reponseJson({ erreur: 'méthode' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return reponseJson({ erreur: 'non authentifié' }, 401);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return reponseJson({ erreur: 'configuration' }, 500);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return reponseJson({ erreur: 'non authentifié' }, 401);

  let corps: { childId?: string; message?: string };
  try {
    corps = await req.json();
  } catch {
    return reponseJson({ erreur: 'corps invalide' }, 400);
  }
  const message = (corps.message ?? '').trim();
  if (!corps.childId || message.length < 3) {
    return reponseJson({ erreur: 'saisie invalide' }, 400);
  }

  // Inscription active de l'enfant (RLS garantit l'appartenance au parent).
  const { data: enr } = await supabase
    .from('enrollments')
    .select('id, classe')
    .eq('child_id', corps.childId)
    .eq('is_active', true)
    .single();
  if (!enr) return reponseJson({ erreur: 'enfant introuvable' }, 404);

  const cycles: Record<string, string> = {
    PS: 'maternelle', MS: 'maternelle', GS: 'maternelle',
    CP1: 'cp_ce1', CP2: 'cp_ce1', CE1: 'cp_ce1',
    CE2: 'ce2_cm2', CM1: 'ce2_cm2', CM2: 'ce2_cm2',
  };
  const cycle = cycles[enr.classe as string];
  const profil = cycle ? profilPourCycle(cycle) : null;
  if (!profil) return reponseJson({ erreur: 'niveau non pris en charge' }, 400);

  // Vérification du quota (sans incrémenter).
  const semaine = semaineIso(new Date());
  const { data: quota } = await supabase
    .from('usage_quotas')
    .select('generations')
    .eq('child_id', corps.childId)
    .eq('semaine_iso', semaine)
    .maybeSingle();
  if ((quota?.generations ?? 0) >= GENERATIONS_PAR_SEMAINE) {
    return reponseJson({ erreur: 'quota atteint' }, 429);
  }

  // Trace de la demande.
  const { data: request, error: eReq } = await supabase
    .from('homework_requests')
    .insert({
      parent_id: user.id, child_id: corps.childId, enrollment_id: enr.id,
      mode: 'primaire', contenu: { message }, statut: 'generation',
    })
    .select('id')
    .single();
  if (eReq || !request) return reponseJson({ erreur: 'création demande' }, 500);

  const resultat = await genererJson({
    systeme: profil.texte,
    message,
    jsonSchema: DEVOIR_JSON_SCHEMA,
    apiKey,
    baseUrl: Deno.env.get('ANTHROPIC_BASE_URL') ?? undefined,
  });

  if (!resultat.ok) {
    await supabase.from('homework_requests')
      .update({ statut: 'echec', erreur: resultat.detail })
      .eq('id', request.id);
    return reponseJson({ erreur: 'génération échouée', requestId: request.id }, 502);
  }

  const parsed = devoirSchema.safeParse(resultat.json);
  if (!parsed.success) {
    await supabase.from('homework_requests')
      .update({ statut: 'echec', erreur: 'schéma invalide' })
      .eq('id', request.id);
    return reponseJson({ erreur: 'génération invalide', requestId: request.id }, 502);
  }

  const { data: devoir, error: eHw } = await supabase
    .from('homeworks')
    .insert({
      request_id: request.id, parent_id: user.id, child_id: corps.childId,
      enrollment_id: enr.id,
      exercices: { matieres: parsed.data.matieres },
      corrige: parsed.data.corrige,
      profil: profil.cle, prompt_version: PROMPT_VERSION, modele: MODELE,
      cout_tokens_entree: resultat.tokensEntree, cout_tokens_sortie: resultat.tokensSortie,
    })
    .select('id, exercices')
    .single();
  if (eHw || !devoir) return reponseJson({ erreur: 'persistance devoir' }, 500);

  await supabase.from('homework_requests').update({ statut: 'pret' }).eq('id', request.id);
  await supabase.rpc('incrementer_quota', { p_child_id: corps.childId, p_semaine_iso: semaine });

  return reponseJson({ homeworkId: devoir.id, devoir: devoir.exercices });
}

Deno.serve(handler);
```

- [ ] **Step 2 : Écrire le test d'intégration Deno**

Créer `supabase/functions/generate-homework/handler.test.ts` :
```ts
// Test d'intégration : faux serveur Claude local + Supabase local réel.
// Prérequis : stack Supabase démarrée ; variables ci-dessous renseignées.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handler } from './index.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEVOIR_FIXE = {
  matieres: [{
    nom: 'Français',
    exercices: [{ numero: 1, consigne: 'Lis MA, ME, MI.', type: 'ecriture', items: ['MA', 'ME', 'MI'], espaceReponse: 'lignes' }],
  }],
  corrige: [{ matiere: 'Français', numero: 1, reponse: 'MA ME MI', explication: 'Syllabes en M.' }],
};

function fauxServeurClaude(): { url: string; stop: () => void } {
  const ac = new AbortController();
  const serveur = Deno.serve({ port: 0, signal: ac.signal }, () =>
    new Response(JSON.stringify({
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 200 },
      content: [{ type: 'text', text: JSON.stringify(DEVOIR_FIXE) }],
    }), { headers: { 'content-type': 'application/json' } }),
  );
  const { port } = serveur.addr as Deno.NetAddr;
  return { url: `http://127.0.0.1:${port}`, stop: () => ac.abort() };
}

async function parentAvecEnfant() {
  const email = `hw-${crypto.randomUUID()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password });
  const { data: childId } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'K', p_prenoms: 'L', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: 'CP1', p_etablissement: 'EPP',
    p_systeme: 'IVOIRIEN', p_matieres: ['Français'],
  });
  return { token: data!.session!.access_token, childId: childId as string };
}

Deno.test('génère et persiste un devoir pour un enfant du primaire', async () => {
  const faux = fauxServeurClaude();
  Deno.env.set('ANTHROPIC_API_KEY', 'test');
  Deno.env.set('ANTHROPIC_BASE_URL', faux.url);
  try {
    const { token, childId } = await parentAvecEnfant();
    const req = new Request('http://local/generate-homework', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ childId, message: 'Français : les syllabes MA ME MI' }),
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    const corps = await res.json();
    assertEquals(corps.devoir.matieres[0].nom, 'Français');
  } finally {
    faux.stop();
  }
});

Deno.test('refuse une saisie trop courte', async () => {
  const { token, childId } = await parentAvecEnfant();
  const req = new Request('http://local/generate-homework', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ childId, message: 'x' }),
  });
  const res = await handler(req);
  assertEquals(res.status, 400);
});
```

- [ ] **Step 3 : Exécuter le test d'intégration**

Récupérer les clés : `npx supabase status -o env`
Run (PowerShell, stack démarrée) :
```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_ROLE_KEY=<service_role> \
deno test --allow-net --allow-env supabase/functions/generate-homework/handler.test.ts
```
Expected: 2 tests PASS. Le premier prouve le chemin complet quota→profil→Claude(mock)→validation→persistance ; le second la validation d'entrée.
(Sous Windows PowerShell, définir les variables avec `$env:SUPABASE_URL=…` avant `deno test`.)

- [ ] **Step 4 : Commit**

```bash
git add supabase/functions/generate-homework
git commit -m "feat: Edge Function generate-homework (quota, profil, Claude, validation, persistance)"
```

---

### Task 9 : Textes UI de la génération

**Files:**
- Modify: `src/i18n/fr.ts`

- [ ] **Step 1 : Ajouter la section devoirs**

Dans `src/i18n/fr.ts`, ajouter une clé `devoirs` dans l'objet `fr` (avant la fermeture `} as const;`) :
```ts
  devoirs: {
    titre: 'Générer un devoir',
    instructionPrimaire: 'Collez le message de l’enseignant (toutes matières confondues).',
    exempleMessage: 'Français : les syllabes MA, ME, MI.\nMathématiques : additions jusqu’à 20.',
    generer: 'Générer le devoir',
    generationEnCours: 'Génération en cours…',
    imprimer: 'Imprimer / Enregistrer en PDF',
    quotaAtteint: 'Quota de la semaine atteint pour cet enfant. Réessayez la semaine prochaine.',
    echec: 'La génération a échoué. Vous pouvez réessayer sans perdre votre quota.',
    aucunEnfant: 'Ajoutez d’abord un enfant.',
    choisirEnfant: 'Pour quel enfant ?',
    entete: { classe: 'Classe', date: 'Date', nom: 'Élève' },
  },
```

- [ ] **Step 2 : Vérifier**

Run: `npm run typecheck && npm run lint`
Expected: succès.

- [ ] **Step 3 : Commit**

```bash
git add src/i18n/fr.ts
git commit -m "feat: textes UI de la génération de devoirs"
```

---

### Task 10 : Client — API de génération et de liste (TDD)

**Files:**
- Create: `src/features/devoirs/api.ts`, `src/features/devoirs/api.test.ts`

- [ ] **Step 1 : Écrire les tests**

Créer `src/features/devoirs/api.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockFrom = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

import { genererDevoir, listerDevoirs } from './api';

beforeEach(() => vi.clearAllMocks());

describe('genererDevoir', () => {
  it('invoque la fonction avec childId et message', async () => {
    mockInvoke.mockResolvedValue({ data: { homeworkId: 'h1', devoir: { matieres: [] } }, error: null });
    const r = await genererDevoir('c1', 'Français : syllabes');
    expect(r.homeworkId).toBe('h1');
    expect(mockInvoke).toHaveBeenCalledWith('generate-homework', {
      body: { childId: 'c1', message: 'Français : syllabes' },
    });
  });
  it('propage le statut de quota', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { context: { status: 429 } },
    });
    await expect(genererDevoir('c1', 'msg valide')).rejects.toMatchObject({ code: 'quota' });
  });
});

describe('listerDevoirs', () => {
  it('liste les devoirs d’un enfant, plus récents d’abord', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    const data = await listerDevoirs('c1');
    expect(data).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('homeworks');
    expect(eq).toHaveBeenCalledWith('child_id', 'c1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/api`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/devoirs/api.ts` :
```ts
import { supabase } from '../../lib/supabase';
import type { Devoir } from './schema';

export type DevoirGenere = { homeworkId: string; devoir: Devoir };

export class GenerationError extends Error {
  code: 'quota' | 'echec' | 'inconnu';
  constructor(code: 'quota' | 'echec' | 'inconnu') {
    super(code);
    this.code = code;
  }
}

export async function genererDevoir(childId: string, message: string): Promise<DevoirGenere> {
  const { data, error } = await supabase.functions.invoke('generate-homework', {
    body: { childId, message },
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) throw new GenerationError('quota');
    throw new GenerationError('echec');
  }
  return data as DevoirGenere;
}

export type DevoirListe = {
  id: string;
  exercices: Devoir;
  created_at: string;
};

export async function listerDevoirs(childId: string): Promise<DevoirListe[]> {
  const { data, error } = await supabase
    .from('homeworks')
    .select('id, exercices, created_at')
    .eq('child_id', childId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DevoirListe[];
}
```

- [ ] **Step 4 : Vérifier le passage**

Run: `npm run test:run -- src/features/devoirs/api`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/devoirs/api.ts src/features/devoirs/api.test.ts
git commit -m "feat: API client de génération et de liste des devoirs"
```

---

### Task 11 : Cache IndexedDB des devoirs (TDD)

**Files:**
- Create: `src/lib/devoirsCache.ts`, `src/lib/devoirsCache.test.ts`
- Modify: `package.json` (dépendance `idb-keyval`)

- [ ] **Step 1 : Installer idb-keyval**

Run: `npm install idb-keyval`
(`idb-keyval` : wrapper minimal et éprouvé d'IndexedDB — évite d'écrire la plomberie IndexedDB à la main.)

- [ ] **Step 2 : Écrire les tests**

Créer `src/lib/devoirsCache.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
}));

import { chargerDevoirCache, mettreEnCacheDevoir } from './devoirsCache';

beforeEach(() => store.clear());

const devoir = { matieres: [], corrige: [] };

describe('cache des devoirs', () => {
  it('met en cache puis recharge un devoir par id', async () => {
    await mettreEnCacheDevoir('h1', devoir);
    expect(await chargerDevoirCache('h1')).toEqual(devoir);
  });
  it('retourne null pour un id absent', async () => {
    expect(await chargerDevoirCache('inconnu')).toBeNull();
  });
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `npm run test:run -- src/lib/devoirsCache`
Expected: FAIL.

- [ ] **Step 4 : Implémenter**

Créer `src/lib/devoirsCache.ts` :
```ts
import { get, set } from 'idb-keyval';
import type { Devoir } from '../features/devoirs/schema';

const cle = (id: string) => `devoir:${id}`;

export async function mettreEnCacheDevoir(id: string, devoir: Devoir): Promise<void> {
  await set(cle(id), devoir);
}

export async function chargerDevoirCache(id: string): Promise<Devoir | null> {
  const valeur = await get(cle(id));
  return (valeur as Devoir | undefined) ?? null;
}
```

- [ ] **Step 5 : Vérifier le passage**

Run: `npm run test:run -- src/lib/devoirsCache`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/devoirsCache.ts src/lib/devoirsCache.test.ts package.json package-lock.json
git commit -m "feat: cache IndexedDB des devoirs (consultation hors ligne)"
```

---

### Task 12 : Rendu HTML/CSS imprimable du devoir (TDD)

**Files:**
- Create: `src/features/devoirs/DevoirDocument.tsx`, `src/features/devoirs/DevoirDocument.test.tsx`

- [ ] **Step 1 : Écrire les tests**

Créer `src/features/devoirs/DevoirDocument.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import { DevoirDocument } from './DevoirDocument';
import type { Devoir } from './schema';

const devoir: Devoir = {
  matieres: [
    {
      nom: 'Français',
      exercices: [
        { numero: 1, consigne: 'Lis les syllabes.', type: 'ecriture', items: ['MA', 'ME'], espaceReponse: 'lignes' },
      ],
    },
  ],
};

it('affiche l’entête avec le nom de l’élève et la classe', () => {
  render(<DevoirDocument devoir={devoir} eleve="Lamine Kouassi" classe="CP1" date="10/07/2026" />);
  expect(screen.getByText('Lamine Kouassi')).toBeInTheDocument();
  expect(screen.getByText('CP1')).toBeInTheDocument();
});

it('affiche les matières, consignes et items', () => {
  render(<DevoirDocument devoir={devoir} eleve="L K" classe="CP1" date="10/07/2026" />);
  expect(screen.getByText('Français')).toBeInTheDocument();
  expect(screen.getByText(/Lis les syllabes\./)).toBeInTheDocument();
  expect(screen.getByText('MA')).toBeInTheDocument();
});

it('affiche le libellé de classe connu', () => {
  render(<DevoirDocument devoir={devoir} eleve="L K" classe="6EME" date="10/07/2026" />);
  expect(screen.getByText('6ème')).toBeInTheDocument(); // classeLabel('6EME')
});
```

Note : le corrigé n'étant jamais renvoyé au client (type `Devoir` = `{ matieres }`), la garantie « pas de corrigé sur la feuille » est structurelle — le composant ne peut pas l'afficher.

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/DevoirDocument`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/devoirs/DevoirDocument.tsx` :
```tsx
import { CLASSES, classeLabel, type Classe } from '../../domain/classes';
import { fr } from '../../i18n/fr';
import type { Devoir } from './schema';

const LIGNES = 'mt-2 border-b border-slate-300 leading-[2.2rem]';

function EspaceReponse({ espace }: { espace: 'lignes' | 'cadre' | 'aucun' }) {
  if (espace === 'lignes') {
    return (
      <div aria-hidden className="mt-2">
        <div className={LIGNES}>&nbsp;</div>
        <div className={LIGNES}>&nbsp;</div>
      </div>
    );
  }
  if (espace === 'cadre') {
    return <div aria-hidden className="mt-2 h-24 rounded border border-slate-300" />;
  }
  return null;
}

export function DevoirDocument(props: {
  devoir: Devoir;
  eleve: string;
  classe: Classe | string;
  date: string;
}) {
  const { devoir, eleve, classe, date } = props;
  const classeTexte = (CLASSES as readonly string[]).includes(String(classe))
    ? classeLabel(classe as Classe)
    : String(classe);
  return (
    <article className="devoir-document mx-auto max-w-[210mm] bg-white p-6 text-slate-900">
      <header className="mb-4 border-b-2 border-teal-700 pb-3">
        <h1 className="text-lg font-bold text-teal-700">{fr.app.nom}</h1>
        <dl className="mt-1 flex flex-wrap gap-x-6 text-sm">
          <div><dt className="inline font-medium">{fr.devoirs.entete.nom} : </dt><dd className="inline">{eleve}</dd></div>
          <div><dt className="inline font-medium">{fr.devoirs.entete.classe} : </dt><dd className="inline">{classeTexte}</dd></div>
          <div><dt className="inline font-medium">{fr.devoirs.entete.date} : </dt><dd className="inline">{date}</dd></div>
        </dl>
      </header>

      {devoir.matieres.map((matiere) => (
        <section key={matiere.nom} className="mb-6 break-inside-avoid">
          <h2 className="mb-2 text-base font-bold uppercase tracking-wide text-slate-700">{matiere.nom}</h2>
          <ol className="space-y-4">
            {matiere.exercices.map((ex) => (
              <li key={ex.numero} className="break-inside-avoid">
                <p className="font-medium">{ex.numero}. {ex.consigne}</p>
                {ex.items.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1 pl-4">
                    {ex.items.map((item, i) => (
                      <li key={i} className="list-disc">{item}</li>
                    ))}
                  </ul>
                )}
                <EspaceReponse espace={ex.espaceReponse} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}
```

- [ ] **Step 4 : Vérifier le passage**

Run: `npm run test:run -- src/features/devoirs/DevoirDocument`
Expected: PASS.

- [ ] **Step 5 : Ajouter le CSS d'impression**

Dans `src/index.css`, après la ligne `@import 'tailwindcss';`, ajouter :
```css
@media print {
  body * { visibility: hidden; }
  .devoir-document, .devoir-document * { visibility: visible; }
  .devoir-document { position: absolute; inset: 0; margin: 0; max-width: none; }
}
```

- [ ] **Step 6 : Vérifier build + lint**

Run: `npm run build && npm run lint`
Expected: succès.

- [ ] **Step 7 : Commit**

```bash
git add src/features/devoirs/DevoirDocument.tsx src/features/devoirs/DevoirDocument.test.tsx src/index.css
git commit -m "feat: rendu HTML/CSS imprimable du devoir"
```

---

### Task 13 : Page de génération + câblage des routes (TDD)

**Files:**
- Create: `src/features/devoirs/GenerateHomeworkPage.tsx`, `src/features/devoirs/GenerateHomeworkPage.test.tsx`
- Modify: `src/routes.tsx`, `src/features/children/ChildrenPage.tsx`

- [ ] **Step 1 : Écrire les tests**

Créer `src/features/devoirs/GenerateHomeworkPage.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const mockGenerer = vi.fn();
vi.mock('./api', () => ({
  genererDevoir: (...a: unknown[]) => mockGenerer(...a),
  GenerationError: class extends Error { code: string; constructor(c: string) { super(c); this.code = c; } },
}));
vi.mock('../../lib/devoirsCache', () => ({ mettreEnCacheDevoir: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1' }),
  useLocation: () => ({ state: { eleve: 'Lamine K', classe: 'CP1' } }),
}));

import { GenerateHomeworkPage } from './GenerateHomeworkPage';

function rendre() {
  return render(<MemoryRouter><GenerateHomeworkPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('génère un devoir et l’affiche', async () => {
  mockGenerer.mockResolvedValue({
    homeworkId: 'h1',
    devoir: {
      matieres: [{ nom: 'Français', exercices: [{ numero: 1, consigne: 'Lis.', type: 'ecriture', items: [], espaceReponse: 'lignes' }] }],
    },
  });
  rendre();
  await userEvent.type(screen.getByLabelText('Générer un devoir'), 'Français : syllabes MA ME');
  await userEvent.click(screen.getByRole('button', { name: 'Générer le devoir' }));
  expect(await screen.findByText('Français')).toBeInTheDocument();
  expect(mockGenerer).toHaveBeenCalledWith('c1', 'Français : syllabes MA ME');
});

it('affiche le message de quota atteint', async () => {
  const { GenerationError } = await import('./api');
  mockGenerer.mockRejectedValue(new GenerationError('quota'));
  rendre();
  await userEvent.type(screen.getByLabelText('Générer un devoir'), 'Français : syllabes');
  await userEvent.click(screen.getByRole('button', { name: 'Générer le devoir' }));
  expect(await screen.findByText(/Quota de la semaine atteint/)).toBeInTheDocument();
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/GenerateHomeworkPage`
Expected: FAIL.

- [ ] **Step 3 : Implémenter la page**

Créer `src/features/devoirs/GenerateHomeworkPage.tsx` :
```tsx
import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import type { Classe } from '../../domain/classes';
import { mettreEnCacheDevoir } from '../../lib/devoirsCache';
import { DevoirDocument } from './DevoirDocument';
import { genererDevoir, GenerationError } from './api';
import type { Devoir } from './schema';

export function GenerateHomeworkPage() {
  const { childId } = useParams();
  const location = useLocation() as { state?: { eleve?: string; classe?: string } };
  const eleve = location.state?.eleve ?? '';
  const classe = (location.state?.classe ?? '') as Classe | string;

  const [message, setMessage] = useState('');
  const [devoir, setDevoir] = useState<Devoir | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const enVol = useRef(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (enVol.current || !childId) return;
    enVol.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await genererDevoir(childId, message.trim());
      await mettreEnCacheDevoir(r.homeworkId, r.devoir);
      setDevoir(r.devoir);
    } catch (e) {
      setErreur(e instanceof GenerationError && e.code === 'quota' ? fr.devoirs.quotaAtteint : fr.devoirs.echec);
    } finally {
      enVol.current = false;
      setEnCours(false);
    }
  }

  const dateDuJour = new Date().toLocaleDateString('fr-FR');

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.devoirs.titre}</h2>

      {!devoir && (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            {fr.devoirs.titre}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={fr.devoirs.exempleMessage}
              rows={6}
              required
              minLength={3}
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-base"
            />
          </label>
          <p className="text-sm text-slate-500">{fr.devoirs.instructionPrimaire}</p>
          <button type="submit" disabled={enCours}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {enCours ? fr.devoirs.generationEnCours : fr.devoirs.generer}
          </button>
        </form>
      )}

      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}

      {devoir && (
        <div className="space-y-3">
          <button type="button" onClick={() => window.print()}
            className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white print:hidden">
            {fr.devoirs.imprimer}
          </button>
          <DevoirDocument devoir={devoir} eleve={eleve} classe={classe} date={dateDuJour} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4 : Câbler la route**

Dans `src/routes.tsx`, ajouter l'import et la route (dans les enfants de `AppShell`, à côté de `/enfants`) :
```tsx
import { GenerateHomeworkPage } from './features/devoirs/GenerateHomeworkPage';
```
Ajouter dans le tableau `children` de l'AppShell :
```tsx
          { path: '/enfants/:childId/devoir', element: <GenerateHomeworkPage /> },
```

- [ ] **Step 5 : Ajouter le lien depuis la liste des enfants**

Dans `src/features/children/ChildrenPage.tsx`, à l'intérieur du `<li>` de chaque enfant (sous le paragraphe de l'inscription), ajouter un lien de génération. Remplacer le bloc `<li>…</li>` par :
```tsx
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-800">{e.prenoms} {e.nom}</p>
              {inscription && (
                <p className="text-sm text-slate-500">
                  {classeLabel(inscription.classe as Classe)} · {inscription.etablissement} · {inscription.annee_scolaire}
                </p>
              )}
              {inscription && (
                <Link
                  to={`/enfants/${e.id}/devoir`}
                  state={{ eleve: `${e.prenoms} ${e.nom}`, classe: inscription.classe }}
                  className="mt-2 inline-block rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  {fr.devoirs.titre}
                </Link>
              )}
            </li>
```

- [ ] **Step 6 : Vérifier**

Run: `npm run test:run && npm run typecheck && npm run lint && npm run build`
Expected: tous les tests PASS, typecheck/lint/build OK.

- [ ] **Step 7 : Commit**

```bash
git add src/features/devoirs/GenerateHomeworkPage.tsx src/features/devoirs/GenerateHomeworkPage.test.tsx src/routes.tsx src/features/children/ChildrenPage.tsx
git commit -m "feat: page de génération de devoir et accès depuis la liste des enfants"
```

---

### Task 14 : Vérification de bout en bout et documentation

**Files:**
- Modify: `README.md`, `supabase/functions/generate-homework/.env.example` (créé)

- [ ] **Step 1 : Documenter le secret Claude local**

Créer `supabase/functions/generate-homework/.env.example` :
```
ANTHROPIC_API_KEY=sk-ant-remplacer-en-local-uniquement
```
Vérifier que `git check-ignore supabase/functions/generate-homework/.env` répond (le motif `.env` du `.gitignore` racine couvre ce chemin). Ne jamais committer le vrai `.env`.

- [ ] **Step 2 : Compléter le README (section Edge Functions)**

Dans `README.md`, sous « Démarrage local », ajouter après la ligne `npm run dev` :
```markdown

### Génération de devoirs (Edge Function)

    # secret local (clé Claude réelle — dépense) :
    cp supabase/functions/generate-homework/.env.example supabase/functions/generate-homework/.env
    # éditer .env, puis :
    npx supabase functions serve generate-homework --env-file supabase/functions/generate-homework/.env

Tests de l'Edge Function (faux serveur Claude, aucune dépense) :

    deno test --allow-net --allow-env supabase/functions/generate-homework/handler.test.ts

En production : `npx supabase secrets set ANTHROPIC_API_KEY=…` puis `npx supabase functions deploy generate-homework`.
```

- [ ] **Step 3 : Vérification E2E manuelle (navigateur)**

Prérequis : stack Supabase démarrée ; `npx supabase functions serve generate-homework --env-file supabase/functions/generate-homework/.env` en cours avec une vraie clé ; `npm run dev`.
- Se connecter (OTP `+2250700000001` / `123456`).
- Ajouter un enfant en CP1 s'il n'y en a pas.
- Depuis « Enfants », cliquer « Générer un devoir ».
- Coller : `Français : les syllabes MA, ME, MI.\nMathématiques : additions jusqu'à 20.`
- Cliquer « Générer le devoir » → un devoir structuré s'affiche (2 matières, exercices, espaces d'écriture, pas de corrigé visible).
- Cliquer « Imprimer / Enregistrer en PDF » → l'aperçu d'impression ne montre que la feuille du devoir.
- Vérifier dans Studio (`http://127.0.0.1:54323`) : une ligne `homeworks` (avec `corrige` non vide), une `homework_requests` en statut `pret`, une `usage_quotas` à `generations = 1`.

Expected: le parcours complet fonctionne ; le devoir est adapté au niveau CP1.

- [ ] **Step 4 : Vérification finale automatisée**

Run: `npm run lint && npm run typecheck && npm run test:run && npm run build && npm run test:rls`
Expected: tout PASS.

- [ ] **Step 5 : Commit**

```bash
git add README.md supabase/functions/generate-homework/.env.example
git commit -m "docs: exécution locale et déploiement de l'Edge Function de génération"
```

---

## Critère de fin du plan 1B-a

Un parent d'un enfant au primaire colle le message WhatsApp de l'enseignant et obtient, en une génération décomptée de son quota hebdomadaire, un devoir structuré adapté au niveau (maternelle / CP-CE1 / CE2-CM2), qu'il imprime en PDF ; le corrigé est stocké mais jamais imprimé sur la feuille de l'enfant ; un autre parent ne voit jamais ces données (prouvé par les tests RLS) ; en cas d'échec de génération, le quota n'est pas consommé. Le devoir reste consultable hors ligne (IndexedDB).

Le **plan 1B-b (mode secondaire)** partira de ce socle : formulaire un champ par matière, profils collège/lycée + règles par matière, gabarit « contrôle », en réutilisant l'Edge Function, le schéma de devoir, le rendu et les quotas.
