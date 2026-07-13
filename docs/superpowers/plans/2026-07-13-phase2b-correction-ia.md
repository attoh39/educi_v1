# EduCI 2b — Correction IA des copies : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les copies envoyées (2a) avec Claude Sonnet 5 vision : lire l'écriture, comparer au corrigé stocké, produire note /20 (secondaire) ou appréciation (primaire) + feedback par exercice, sous quota corrections dédié.

**Architecture:** Nouvelle Edge Function `correct-submission` (patron `generate-homework`) : télécharge les photos du bucket privé, les envoie en base64 à Claude vision avec l'énoncé + le corrigé, valide et persiste dans `corrections`. Quota corrections séparé sur `usage_quotas`. Client : déclenchement depuis la page capture + affichage `CorrectionDocument`.

**Tech Stack:** React + Vite + TS strict, Vitest + RTL, Deno, zod, Supabase (Storage + PostgREST). Branche `phase-2b`. Stack Supabase locale **avec storage** ; tests RLS en séquentiel (déjà configuré). Node 24, Deno installé.

**Note API Claude (anti-hallucination) :** la Task 5 étend `claude.ts` pour la vision (bloc image base64). L'implémenteur DOIT charger la skill `claude-api` et vérifier la forme exacte du bloc image (`{type:'image', source:{type:'base64', media_type, data}}`) et le comportement `output_config.format` avec un champ nullable/optionnel avant de committer.

---

## Structure de fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `supabase/migrations/20260713140000_corrections.sql` | table corrections + quota + RPC | créé |
| `supabase/tests/rls-corrections.test.ts` | isolation + RPC quota | créé |
| `src/features/correction/schema.ts` (+test) | schéma correction client | créé |
| `supabase/functions/_shared/correction.ts` | schéma + profil + JSON Schema (Edge) | créé |
| `supabase/functions/_shared/correction.test.ts` | test profil | créé |
| `supabase/functions/_shared/claude.ts` | +support images base64 | modifié |
| `supabase/functions/correct-submission/index.ts` (+handler.test.ts) | orchestration correction | créé |
| `src/features/copies/api.ts` | + `corrigerSoumission` | modifié |
| `src/i18n/fr.ts` | + section `correction` | modifié |
| `src/features/correction/CorrectionDocument.tsx` (+test) | affichage correction | créé |
| `src/features/copies/CaptureCopiesPage.tsx` (+test) | déclenchement correction | modifié |
| `src/lib/database.types.ts` | régénéré | modifié |

---

### Task 1 : Migration — table corrections, quota, RPC

**Files:**
- Create: `supabase/migrations/20260713140000_corrections.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260713140000_corrections.sql` :
```sql
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
```

- [ ] **Step 2 : Appliquer et linter**

Run: `npx supabase db reset` (attendu : migrations appliquées ; avertissement storage sous Windows = bruit inoffensif).
Run: `npx supabase db lint` → `No schema errors found`.

- [ ] **Step 3 : Régénérer les types**

Run: `npx supabase gen types typescript --local > src/lib/database.types.ts`
Vérifie que `corrections` apparaît dans le fichier.

- [ ] **Step 4 : Vérifier**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260713140000_corrections.sql src/lib/database.types.ts
git commit -m "feat: table corrections, quota corrections et RPC incrementer_correction"
```

---

### Task 2 : Tests d'isolation corrections + RPC (intégration)

**Files:**
- Create: `supabase/tests/rls-corrections.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `supabase/tests/rls-corrections.test.ts` :
```ts
import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function parentAvecSoumission(tag: string) {
  const email = `${tag}-${Date.now()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await client.auth.signInWithPassword({ email, password });
  const id = sess!.user!.id;
  const { data: childId } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'K', p_prenoms: 'L', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: 'CP1', p_etablissement: 'EPP',
    p_systeme: 'IVOIRIEN', p_matieres: ['Français'],
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
  return { client, id, childId: childId as string, homeworkId: hw!.id as string, submissionId: sub!.id as string };
}

describe('Isolation des corrections', () => {
  let a: Awaited<ReturnType<typeof parentAvecSoumission>>;
  let b: Awaited<ReturnType<typeof parentAvecSoumission>>;

  beforeAll(async () => {
    a = await parentAvecSoumission('xa');
    b = await parentAvecSoumission('xb');
    await a.client.from('corrections').insert({
      submission_id: a.submissionId, homework_id: a.homeworkId, parent_id: a.id, child_id: a.childId,
      note: 15, appreciation: 'Bien', details: [], modele: 'claude-sonnet-5', prompt_version: 'correction-v1',
    });
  });

  it('le parent B ne voit pas les corrections de A', async () => {
    const { data } = await b.client.from('corrections').select('*');
    expect(data).toHaveLength(0);
  });

  it('incrementer_correction crée puis incrémente sans toucher generations', async () => {
    const { data: t1 } = await a.client.rpc('incrementer_correction', { p_child_id: a.childId, p_semaine_iso: '2026-W40' });
    expect(t1).toBe(1);
    const { data: t2 } = await a.client.rpc('incrementer_correction', { p_child_id: a.childId, p_semaine_iso: '2026-W40' });
    expect(t2).toBe(2);
    const { data: q } = await a.client.from('usage_quotas').select('generations, corrections')
      .eq('child_id', a.childId).eq('semaine_iso', '2026-W40').single();
    expect(q).toMatchObject({ generations: 0, corrections: 2 });
  });

  it('B ne peut pas incrémenter le quota correction de l’enfant de A', async () => {
    const { error } = await b.client.rpc('incrementer_correction', { p_child_id: a.childId, p_semaine_iso: '2026-W41' });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2 : Exécuter**

Run: `npm run test:rls`
Expected: suites socle (8) + devoirs (6) + copies (4) + corrections (3) = **21 tests** PASS (séquentiel).

- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/rls-corrections.test.ts
git commit -m "test: isolation RLS corrections et RPC incrementer_correction"
```

---

### Task 3 : Schéma de correction côté client (TDD)

**Files:**
- Create: `src/features/correction/schema.ts`, `src/features/correction/schema.test.ts`

- [ ] **Step 1 : Test**

Créer `src/features/correction/schema.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { correctionSchema } from './schema';

const valide = {
  note: 15,
  appreciation: 'Bon travail.',
  details: [{ matiere: 'Français', numero: 1, statut: 'reussi', explication: 'ok', bonneReponse: 'MA' }],
};

describe('correctionSchema', () => {
  it('accepte une correction notée', () => {
    expect(correctionSchema.safeParse(valide).success).toBe(true);
  });
  it('accepte une note absente (primaire)', () => {
    const { note: _omit, ...sansNote } = valide;
    expect(correctionSchema.safeParse(sansNote).success).toBe(true);
  });
  it('refuse un statut inconnu', () => {
    const x = structuredClone(valide);
    (x.details[0] as { statut: string }).statut = 'nul';
    expect(correctionSchema.safeParse(x).success).toBe(false);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/correction/schema`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/correction/schema.ts` :
```ts
import { z } from 'zod';

export const STATUTS_EXERCICE = ['reussi', 'partiel', 'a_revoir'] as const;

const detailSchema = z.object({
  matiere: z.string(),
  numero: z.number().int().positive(),
  statut: z.enum(STATUTS_EXERCICE),
  explication: z.string(),
  bonneReponse: z.string(),
});

export const correctionSchema = z.object({
  note: z.number().min(0).max(20).optional(),
  appreciation: z.string(),
  details: z.array(detailSchema),
});

export type Correction = z.infer<typeof correctionSchema>;
export type StatutExercice = (typeof STATUTS_EXERCICE)[number];
```

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/correction/schema && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/correction/schema.ts src/features/correction/schema.test.ts
git commit -m "feat: schéma de correction côté client"
```

---

### Task 4 : Module de correction partagé (Edge) (TDD Deno)

**Files:**
- Create: `supabase/functions/_shared/correction.ts`, `supabase/functions/_shared/correction.test.ts`

- [ ] **Step 1 : Test**

Créer `supabase/functions/_shared/correction.test.ts` :
```ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { correctionSchema, profilCorrection, PROMPT_VERSION_CORRECTION } from './correction.ts';

Deno.test('profilCorrection : primaire = appréciation, secondaire = note /20', () => {
  assert(profilCorrection('primaire').includes('appréciation'));
  assert(profilCorrection('secondaire').includes('20'));
});

Deno.test('correctionSchema valide une correction', () => {
  const r = correctionSchema.safeParse({ note: 12, appreciation: 'ok', details: [] });
  assert(r.success);
});

Deno.test('PROMPT_VERSION_CORRECTION défini', () => {
  assertEquals(PROMPT_VERSION_CORRECTION, 'correction-v1');
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `deno test --node-modules-dir=none supabase/functions/_shared/correction.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3 : Implémenter**

Créer `supabase/functions/_shared/correction.ts` :
```ts
import { z } from 'npm:zod@3';

export const PROMPT_VERSION_CORRECTION = 'correction-v1';
export const STATUTS_EXERCICE = ['reussi', 'partiel', 'a_revoir'] as const;

export const correctionSchema = z.object({
  note: z.number().min(0).max(20).optional(),
  appreciation: z.string().min(1),
  details: z.array(
    z.object({
      matiere: z.string().min(1),
      numero: z.number().int().positive(),
      statut: z.enum(STATUTS_EXERCICE),
      explication: z.string(),
      bonneReponse: z.string(),
    }),
  ),
});

export type Correction = z.infer<typeof correctionSchema>;

export const CORRECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    note: { type: 'number' },
    appreciation: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matiere: { type: 'string' },
          numero: { type: 'integer' },
          statut: { type: 'string', enum: [...STATUTS_EXERCICE] },
          explication: { type: 'string' },
          bonneReponse: { type: 'string' },
        },
        required: ['matiere', 'numero', 'statut', 'explication', 'bonneReponse'],
      },
    },
  },
  required: ['appreciation', 'details'],
} as const;

const COMMUN = `Tu es un enseignant qui corrige la copie manuscrite d'un élève en Côte d'Ivoire.
On te fournit l'énoncé du devoir, le corrigé de référence, et les photos de la copie de l'élève.
Règles :
- Réponds UNIQUEMENT avec un objet JSON conforme au schéma imposé, sans texte autour.
- Lis attentivement l'écriture manuscrite de l'enfant, même imparfaite.
- Compare chaque réponse au corrigé de référence.
- Pour chaque exercice, donne un statut ("reussi", "partiel" ou "a_revoir"),
  une explication courte et bienveillante, et la bonne réponse.
- Rédige en français, avec des mots simples et encourageants.
- Si une copie est illisible, indique-le dans l'appréciation et mets "a_revoir".`;

export function profilCorrection(mode: 'primaire' | 'secondaire'): string {
  if (mode === 'secondaire') {
    return `${COMMUN}
Niveau secondaire : attribue une note chiffrée "note" sur 20, égale à la somme des points obtenus
selon le barème de l'énoncé. Corrigé détaillé.`;
  }
  return `${COMMUN}
Niveau primaire : NE mets PAS de "note" chiffrée (omets le champ). Donne une appréciation
qualitative globale et un statut par exercice. Ton très encourageant.`;
}
```

- [ ] **Step 4 : Vérifier**

Run: `deno test --node-modules-dir=none supabase/functions/_shared/correction.test.ts`
Expected: 3 PASS.

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/_shared/correction.ts supabase/functions/_shared/correction.test.ts
git commit -m "feat: module de correction partagé (schéma, JSON Schema, profil)"
```

---

### Task 5 : Support des images dans le client Claude

**Files:**
- Modify: `supabase/functions/_shared/claude.ts`

- [ ] **Step 1 : Vérifier l'API vision (obligatoire)**

Charger la skill `claude-api` et confirmer la forme du bloc image base64 :
`{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '<base64>' } }`
dans `messages[].content` (tableau). Confirmer que `output_config.format` reste compatible avec des images. Corriger le code ci-dessous si l'API réelle diffère, et le signaler.

- [ ] **Step 2 : Modifier `genererJson`**

Dans `supabase/functions/_shared/claude.ts`, ajouter le paramètre optionnel `images` et construire le `content` en conséquence. Remplacer la signature et le corps `messages` :
```ts
export async function genererJson(params: {
  systeme: string;
  message: string;
  jsonSchema: unknown;
  apiKey: string;
  baseUrl?: string;
  images?: string[]; // base64 JPEG ; si présent, contenu multimodal
}): Promise<ResultatClaude> {
```
Puis, dans le corps de la requête, remplacer la ligne `messages` par :
```ts
        messages: [{
          role: 'user',
          content: params.images && params.images.length > 0
            ? [
                { type: 'text', text: params.message },
                ...params.images.map((data) => ({
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/jpeg', data },
                })),
              ]
            : params.message,
        }],
```
(Le reste du fichier est inchangé.)

- [ ] **Step 3 : Vérifier Deno**

Run: `deno check --node-modules-dir=none supabase/functions/_shared/claude.ts`
Expected: aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add supabase/functions/_shared/claude.ts
git commit -m "feat: support des images base64 dans le client Claude (vision)"
```

---

### Task 6 : Edge Function correct-submission + test d'intégration

**Files:**
- Create: `supabase/functions/correct-submission/index.ts`, `supabase/functions/correct-submission/handler.test.ts`

- [ ] **Step 1 : Écrire le handler**

Créer `supabase/functions/correct-submission/index.ts` :
```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { correctionSchema, CORRECTION_JSON_SCHEMA, profilCorrection, PROMPT_VERSION_CORRECTION } from '../_shared/correction.ts';
import { genererJson, MODELE } from '../_shared/claude.ts';

const CORRECTIONS_PAR_SEMAINE = 10;

const CYCLES: Record<string, string> = {
  PS: 'maternelle', MS: 'maternelle', GS: 'maternelle',
  CP1: 'cp_ce1', CP2: 'cp_ce1', CE1: 'cp_ce1',
  CE2: 'ce2_cm2', CM1: 'ce2_cm2', CM2: 'ce2_cm2',
  '6EME': 'college', '5EME': 'college', '4EME': 'college', '3EME': 'college',
  SECONDE: 'lycee', PREMIERE: 'lycee', TERMINALE: 'lycee',
};

function semaineIso(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semaine).padStart(2, '0')}`;
}

function reponseJson(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json' } });
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

  let corps: { submissionId?: string };
  try { corps = await req.json(); } catch { return reponseJson({ erreur: 'corps invalide' }, 400); }
  if (!corps.submissionId) return reponseJson({ erreur: 'saisie invalide' }, 400);

  const { data: sub } = await supabase.from('submissions')
    .select('id, homework_id, child_id, photo_paths')
    .eq('id', corps.submissionId).single();
  if (!sub) return reponseJson({ erreur: 'soumission introuvable' }, 404);

  const { data: hw } = await supabase.from('homeworks')
    .select('exercices, corrige, enrollment_id').eq('id', sub.homework_id).single();
  if (!hw) return reponseJson({ erreur: 'devoir introuvable' }, 404);
  const { data: enr } = await supabase.from('enrollments').select('classe').eq('id', hw.enrollment_id).single();
  const cycle = enr ? CYCLES[enr.classe as string] : undefined;
  const mode: 'primaire' | 'secondaire' = cycle === 'college' || cycle === 'lycee' ? 'secondaire' : 'primaire';

  const semaine = semaineIso(new Date());
  const { data: quota } = await supabase.from('usage_quotas').select('corrections')
    .eq('child_id', sub.child_id).eq('semaine_iso', semaine).maybeSingle();
  if ((quota?.corrections ?? 0) >= CORRECTIONS_PAR_SEMAINE) return reponseJson({ erreur: 'quota atteint' }, 429);

  // Télécharger les photos et les encoder en base64.
  const images: string[] = [];
  for (const chemin of (sub.photo_paths as string[])) {
    const { data: blob, error } = await supabase.storage.from('copies').download(chemin);
    if (error || !blob) return reponseJson({ erreur: 'lecture copie' }, 502);
    images.push(encodeBase64(new Uint8Array(await blob.arrayBuffer())));
  }
  if (images.length === 0) return reponseJson({ erreur: 'aucune copie' }, 400);

  await supabase.from('submissions').update({ statut: 'correction' }).eq('id', sub.id);

  const message = `ÉNONCÉ:\n${JSON.stringify(hw.exercices)}\n\nCORRIGÉ DE RÉFÉRENCE:\n${JSON.stringify(hw.corrige)}\n\nCorrige la copie de l'élève à partir des photos.`;
  const resultat = await genererJson({
    systeme: profilCorrection(mode), message, jsonSchema: CORRECTION_JSON_SCHEMA, apiKey, images,
    baseUrl: Deno.env.get('ANTHROPIC_BASE_URL') ?? undefined,
  });
  if (!resultat.ok) {
    await supabase.from('submissions').update({ statut: 'echec', erreur: resultat.detail }).eq('id', sub.id);
    return reponseJson({ erreur: 'correction échouée' }, 502);
  }
  const parsed = correctionSchema.safeParse(resultat.json);
  if (!parsed.success) {
    await supabase.from('submissions').update({ statut: 'echec', erreur: 'schéma invalide' }).eq('id', sub.id);
    return reponseJson({ erreur: 'correction invalide' }, 502);
  }

  const { data: correction, error: eCorr } = await supabase.from('corrections').insert({
    submission_id: sub.id, homework_id: sub.homework_id, parent_id: user.id, child_id: sub.child_id,
    note: parsed.data.note ?? null, appreciation: parsed.data.appreciation, details: parsed.data.details,
    modele: MODELE, prompt_version: PROMPT_VERSION_CORRECTION,
    cout_tokens_entree: resultat.tokensEntree, cout_tokens_sortie: resultat.tokensSortie,
  }).select('note, appreciation, details').single();
  if (eCorr || !correction) return reponseJson({ erreur: 'persistance correction' }, 500);

  await supabase.from('submissions').update({ statut: 'corrige' }).eq('id', sub.id);
  await supabase.rpc('incrementer_correction', { p_child_id: sub.child_id, p_semaine_iso: semaine });

  return reponseJson({
    note: correction.note, appreciation: correction.appreciation, details: correction.details,
  });
}

if (import.meta.main) Deno.serve(handler);
```

- [ ] **Step 2 : Écrire le test d'intégration**

Créer `supabase/functions/correct-submission/handler.test.ts` :
```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handler } from './index.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORRECTION_FIXE = {
  note: 15,
  appreciation: 'Bon travail, quelques erreurs.',
  details: [{ matiere: 'Français', numero: 1, statut: 'reussi', explication: 'Bien lu.', bonneReponse: 'MA' }],
};

function fauxServeurClaude(): { url: string; stop: () => void } {
  const ac = new AbortController();
  const serveur = Deno.serve({ port: 0, signal: ac.signal }, () =>
    new Response(JSON.stringify({
      stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 200 },
      content: [{ type: 'text', text: JSON.stringify(CORRECTION_FIXE) }],
    }), { headers: { 'content-type': 'application/json' } }));
  const { port } = serveur.addr as Deno.NetAddr;
  return { url: `http://127.0.0.1:${port}`, stop: () => ac.abort() };
}

async function parentAvecSoumission() {
  const email = `corr-${crypto.randomUUID()}@test.educi.ci`;
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
  const chemin = `${id}/${childId}/${hw!.id}/p1.jpg`;
  await client.storage.from('copies').upload(chemin, new Blob(['img'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  const { data: sub } = await client.from('submissions').insert({
    parent_id: id, child_id: childId, homework_id: hw!.id, photo_paths: [chemin],
  }).select('id').single();
  return { token: sess!.session!.access_token, submissionId: sub!.id as string, client, childId };
}

Deno.test('corrige une soumission et persiste la correction', async () => {
  const faux = fauxServeurClaude();
  Deno.env.set('ANTHROPIC_API_KEY', 'test');
  Deno.env.set('ANTHROPIC_BASE_URL', faux.url);
  try {
    const { token, submissionId, client } = await parentAvecSoumission();
    const req = new Request('http://local/correct-submission', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ submissionId }),
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    const corps = await res.json();
    assertEquals(corps.appreciation, 'Bon travail, quelques erreurs.');
    const { data: sub } = await client.from('submissions').select('statut').eq('id', submissionId).single();
    assertEquals(sub!.statut, 'corrige');
  } finally {
    faux.stop();
  }
});

Deno.test('refuse une saisie sans submissionId', async () => {
  const { token } = await parentAvecSoumission();
  const req = new Request('http://local/correct-submission', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  assertEquals((await handler(req)).status, 400);
});
```

- [ ] **Step 3 : Créer la config de la fonction et exécuter**

Run: `npx supabase functions new correct-submission` (crée l'ossature ; on remplace `index.ts` par le nôtre — écraser). Vérifie que `supabase/config.toml` a une section `[functions.correct-submission]`.
Récupère les clés : `npx supabase status -o env`. Puis :
```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_ROLE_KEY=<service_role> \
deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/correct-submission/handler.test.ts
```
Expected: 2 tests PASS. (Ne jamais mettre la clé service_role dans un rapport.)

- [ ] **Step 4 : Commit**

```bash
git add supabase/functions/correct-submission supabase/config.toml
git commit -m "feat: Edge Function correct-submission (vision, correction, persistance)"
```

---

### Task 7 : Client — API corrigerSoumission + i18n

**Files:**
- Modify: `src/features/copies/api.ts`, `src/i18n/fr.ts`

- [ ] **Step 1 : Test**

Ajouter à `src/features/copies/api.test.ts` (dans le fichier existant, nouveau bloc) :
```ts
describe('corrigerSoumission', () => {
  it('invoque correct-submission et retourne la correction', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { note: 15, appreciation: 'ok', details: [] }, error: null });
    // @ts-expect-error accès au mock défini en tête de fichier
    globalThis.__mockInvokeCorr = invoke;
  });
});
```
Note : le fichier `api.test.ts` mocke déjà `supabase.storage` et `supabase.from`. Ajoute `functions: { invoke }` au mock de `../../lib/supabase` en tête du fichier, puis teste :
```ts
// en tête, dans le vi.mock('../../lib/supabase', …), ajouter :
//   functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
// et déclarer const mockInvoke = vi.fn();
```
Test concret à ajouter (remplace le bloc ci-dessus) :
```ts
describe('corrigerSoumission', () => {
  it('invoque correct-submission et propage le quota', async () => {
    mockInvoke.mockResolvedValue({ data: { note: 15, appreciation: 'ok', details: [] }, error: null });
    const c = await corrigerSoumission('s1');
    expect(c.appreciation).toBe('ok');
    expect(mockInvoke).toHaveBeenCalledWith('correct-submission', { body: { submissionId: 's1' } });
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 429 } } });
    await expect(corrigerSoumission('s1')).rejects.toMatchObject({ code: 'quota' });
  });
});
```
Ajoute en tête du fichier `const mockInvoke = vi.fn();` et, dans l'objet mock de `supabase`, `functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },`. Ajoute `corrigerSoumission` à l'import depuis `./api`.

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/copies/api`
Expected: FAIL (`corrigerSoumission` absent).

- [ ] **Step 3 : Implémenter**

Dans `src/features/copies/api.ts`, ajouter en haut l'import du type et l'erreur, puis la fonction :
```ts
import type { Correction } from '../correction/schema';

export class CorrectionError extends Error {
  code: 'quota' | 'echec';
  constructor(code: 'quota' | 'echec') { super(code); this.code = code; }
}

export async function corrigerSoumission(submissionId: string): Promise<Correction> {
  const { data, error } = await supabase.functions.invoke('correct-submission', {
    body: { submissionId },
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    throw new CorrectionError(status === 429 ? 'quota' : 'echec');
  }
  return data as Correction;
}
```

- [ ] **Step 4 : i18n**

Dans `src/i18n/fr.ts`, ajouter après la section `copies` (avant `} as const;`) une section `correction` :
```ts
  correction: {
    lancer: 'Lancer la correction',
    enCours: 'Correction en cours…',
    titre: 'Correction',
    note: 'Note',
    reussi: 'Réussi',
    partiel: 'Partiel',
    aRevoir: 'À revoir',
    bonneReponse: 'Bonne réponse',
    quotaAtteint: 'Quota de corrections de la semaine atteint. Réessayez la semaine prochaine.',
    echec: 'La correction a échoué (copies illisibles ?). Réessayez sans perdre votre quota.',
  },
```

- [ ] **Step 5 : Vérifier**

Run: `npm run test:run -- src/features/copies/api && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/features/copies/api.ts src/features/copies/api.test.ts src/i18n/fr.ts
git commit -m "feat: API client de correction et textes UI"
```

---

### Task 8 : CorrectionDocument (TDD)

**Files:**
- Create: `src/features/correction/CorrectionDocument.tsx`, `src/features/correction/CorrectionDocument.test.tsx`

- [ ] **Step 1 : Test**

Créer `src/features/correction/CorrectionDocument.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import { CorrectionDocument } from './CorrectionDocument';
import type { Correction } from './schema';

const correction: Correction = {
  note: 15,
  appreciation: 'Bon travail.',
  details: [
    { matiere: 'Français', numero: 1, statut: 'reussi', explication: 'Bien lu.', bonneReponse: 'MA' },
    { matiere: 'Français', numero: 2, statut: 'a_revoir', explication: 'Revois la syllabe.', bonneReponse: 'ME' },
  ],
};

it('affiche la note, l’appréciation et le feedback par exercice', () => {
  render(<CorrectionDocument correction={correction} />);
  expect(screen.getByText(/15/)).toBeInTheDocument();
  expect(screen.getByText('Bon travail.')).toBeInTheDocument();
  expect(screen.getByText('Réussi')).toBeInTheDocument();
  expect(screen.getByText('À revoir')).toBeInTheDocument();
  expect(screen.getByText(/Revois la syllabe\./)).toBeInTheDocument();
});

it('sans note (primaire) affiche seulement l’appréciation', () => {
  render(<CorrectionDocument correction={{ ...correction, note: undefined }} />);
  expect(screen.queryByText('Note')).not.toBeInTheDocument();
  expect(screen.getByText('Bon travail.')).toBeInTheDocument();
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/correction/CorrectionDocument`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/correction/CorrectionDocument.tsx` :
```tsx
import { fr } from '../../i18n/fr';
import type { Correction, StatutExercice } from './schema';

const BADGE: Record<StatutExercice, { texte: string; classe: string }> = {
  reussi: { texte: fr.correction.reussi, classe: 'bg-green-100 text-green-700' },
  partiel: { texte: fr.correction.partiel, classe: 'bg-amber-100 text-amber-700' },
  a_revoir: { texte: fr.correction.aRevoir, classe: 'bg-red-100 text-red-700' },
};

export function CorrectionDocument({ correction }: { correction: Correction }) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {correction.note != null && (
          <p className="text-lg font-bold text-teal-700">
            {fr.correction.note} : {correction.note}/20
          </p>
        )}
        <p className="mt-1 text-slate-700">{correction.appreciation}</p>
      </div>
      <ul className="space-y-2">
        {correction.details.map((d, i) => {
          const badge = BADGE[d.statut];
          return (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{d.matiere} · {d.numero}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.classe}`}>{badge.texte}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{d.explication}</p>
              <p className="mt-1 text-sm text-slate-500">{fr.correction.bonneReponse} : {d.bonneReponse}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/correction/CorrectionDocument && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/correction/CorrectionDocument.tsx src/features/correction/CorrectionDocument.test.tsx
git commit -m "feat: affichage de la correction (note, appréciation, feedback)"
```

---

### Task 9 : Déclenchement de la correction dans la page capture (TDD)

**Files:**
- Modify: `src/features/copies/CaptureCopiesPage.tsx`, `src/features/copies/CaptureCopiesPage.test.tsx`

- [ ] **Step 1 : Étendre le test**

Dans `src/features/copies/CaptureCopiesPage.test.tsx`, ajouter aux mocks existants le mock de correction et de CorrectionDocument, et un test. En tête, après les mocks existants, ajouter :
```ts
const mockCorriger = vi.fn();
vi.mock('../correction/CorrectionDocument', () => ({
  CorrectionDocument: () => <div>DOC_CORRECTION</div>,
}));
```
Et modifier le mock de `./api` pour inclure `corrigerSoumission` et `CorrectionError` :
```ts
vi.mock('./api', () => ({
  creerSoumission: (...a: unknown[]) => mockCreer(...a),
  corrigerSoumission: (...a: unknown[]) => mockCorriger(...a),
  CorrectionError: class extends Error { code: string; constructor(c: string) { super(c); this.code = c; } },
}));
```
Ajouter le test :
```ts
it('après envoi, lance la correction et affiche le résultat', async () => {
  mockCompresser.mockResolvedValue(new Blob(['z'], { type: 'image/jpeg' }));
  mockEnvoyer.mockResolvedValue({ envoyes: ['parent-1/c1/h1/u.jpg'], echoues: [] });
  mockCreer.mockResolvedValue({ id: 's1' });
  mockCorriger.mockResolvedValue({ note: 15, appreciation: 'ok', details: [] });
  rendre();
  await userEvent.upload(screen.getByLabelText('Ajouter une photo'), new File(['x'], 'c.jpg', { type: 'image/jpeg' }));
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Lancer la correction' }));
  expect(await screen.findByText('DOC_CORRECTION')).toBeInTheDocument();
  expect(mockCorriger).toHaveBeenCalledWith('s1');
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/copies/CaptureCopiesPage`
Expected: FAIL (bouton « Lancer la correction » absent).

- [ ] **Step 3 : Étendre la page**

Remplacer `src/features/copies/CaptureCopiesPage.tsx` par (ajoute la phase correction après l'envoi réussi) :
```tsx
import { useRef, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import { useAuth } from '../auth/AuthProvider';
import { compresserImage } from './compression';
import { envoyerElements } from './envoi';
import { creerSoumission, corrigerSoumission, CorrectionError } from './api';
import type { ElementFile } from './copiesQueue';
import { CorrectionDocument } from '../correction/CorrectionDocument';
import type { Correction } from '../correction/schema';

type Etat = 'saisie' | 'envoi' | 'partiel' | 'envoye' | 'correction' | 'corrige';

export function CaptureCopiesPage() {
  const { childId, homeworkId } = useParams();
  const { session } = useAuth();
  const parentId = session?.user.id ?? '';
  const [elements, setElements] = useState<ElementFile[]>([]);
  const [etat, setEtat] = useState<Etat>('saisie');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const enVol = useRef(false);

  async function onAjout(e: ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const f of fichiers) {
      const blob = await compresserImage(f);
      setElements((prev) => [...prev, { id: crypto.randomUUID(), blob }]);
    }
  }

  async function onEnvoi() {
    if (enVol.current || !childId || !homeworkId || elements.length === 0) return;
    enVol.current = true;
    setEtat('envoi');
    const { envoyes, echoues } = await envoyerElements(parentId, childId, homeworkId, elements);
    if (echoues.length > 0 || envoyes.length === 0) {
      setEtat('partiel'); enVol.current = false; return;
    }
    const soumission = await creerSoumission(homeworkId, childId, envoyes);
    setSubmissionId(soumission.id);
    setElements([]);
    setEtat('envoye');
    enVol.current = false;
  }

  async function onCorrection() {
    if (enVol.current || !submissionId) return;
    enVol.current = true;
    setEtat('correction');
    setErreur(null);
    try {
      const c = await corrigerSoumission(submissionId);
      setCorrection(c);
      setEtat('corrige');
    } catch (err) {
      setErreur(err instanceof CorrectionError && err.code === 'quota' ? fr.correction.quotaAtteint : fr.correction.echec);
      setEtat('envoye');
    } finally {
      enVol.current = false;
    }
  }

  if (etat === 'corrige' && correction) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">{fr.correction.titre}</h2>
        <CorrectionDocument correction={correction} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.copies.captureTitre}</h2>

      {etat === 'envoye' || etat === 'correction' ? (
        <>
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{fr.copies.envoiReussi}</p>
          {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
          <button type="button" onClick={onCorrection} disabled={etat === 'correction'}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {etat === 'correction' ? fr.correction.enCours : fr.correction.lancer}
          </button>
        </>
      ) : (
        <>
          <label className="block">
            <span className="inline-block rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white">{fr.copies.ajouterPhoto}</span>
            <input type="file" accept="image/*" capture="environment" multiple onChange={onAjout} className="sr-only" aria-label={fr.copies.ajouterPhoto} />
          </label>
          <p className="text-sm text-slate-600">{elements.length} {fr.copies.enFile}</p>
          {etat === 'partiel' && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{fr.copies.envoiPartiel}</p>}
          <button type="button" onClick={onEnvoi} disabled={etat === 'envoi' || elements.length === 0}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {etat === 'envoi' ? fr.copies.envoiEnCours : etat === 'partiel' ? fr.copies.reessayer : fr.copies.envoyer}
          </button>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/copies/CaptureCopiesPage && npm run typecheck && npm run lint`
Expected: PASS (les 2 tests existants + le nouveau).

- [ ] **Step 5 : Commit**

```bash
git add src/features/copies/CaptureCopiesPage.tsx src/features/copies/CaptureCopiesPage.test.tsx
git commit -m "feat: déclenchement de la correction après l'envoi des copies"
```

---

### Task 10 : Vérification finale et documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1 : Vérification complète**

Run: `npm run lint && npm run typecheck && npm run test:run && npm run build`
Expected: tout PASS.
Run: `npm run test:rls` → 21 tests (socle 8 + devoirs 6 + copies 4 + corrections 3).
Run: `deno test --node-modules-dir=none supabase/functions/_shared/correction.test.ts` → 3 PASS.

- [ ] **Step 2 : README**

Dans `README.md`, après la section « Envoi des copies (2a) », ajouter :
```markdown

### Correction IA (2b)

Depuis l'écran de capture, après l'envoi des copies, le parent lance la
correction. L'Edge Function `correct-submission` télécharge les photos (base64),
les envoie avec l'énoncé et le corrigé à Claude Sonnet 5 vision, et persiste une
correction (`corrections`) : note /20 au secondaire, appréciation au primaire,
feedback par exercice. Quota `corrections/semaine` séparé. Déploiement identique
à `generate-homework` (même secret `ANTHROPIC_API_KEY`).
```

- [ ] **Step 3 : Commit**

```bash
git add README.md
git commit -m "docs: correction IA des copies (Edge Function vision, quota)"
```

---

## Critère de fin

Un parent ayant envoyé des copies lance la correction et voit une note /20
(secondaire) ou une appréciation (primaire) + un feedback par exercice ; la
correction est persistée, la soumission passe `corrige`, le quota corrections est
décrémenté ; en cas d'échec, la soumission passe `echec` sans décompte ; un autre
parent ne voit jamais la correction (RLS). Vérification complète verte.

## Self-review (writing-plans)

- **Couverture spec** : corrections table + quota + RPC (T1), tests isolation +
  RPC (T2), schéma client (T3), module correction Edge + profil (T4), images
  base64 dans claude (T5), Edge Function correct-submission + intégration (T6),
  api client + i18n (T7), CorrectionDocument (T8), déclenchement page (T9), vérif
  + doc (T10). Couvre toutes les sections du design.
- **Types** : `Correction`/`correctionSchema`/`STATUTS_EXERCICE` (T3) consommés
  par CorrectionDocument (T8), api (T7), page (T9) ; `CORRECTION_JSON_SCHEMA`/
  `profilCorrection`/`PROMPT_VERSION_CORRECTION` (T4) par l'Edge Function (T6) ;
  `genererJson({images})` (T5) par l'Edge Function (T6) ; `CorrectionError`/
  `corrigerSoumission` (T7) par la page (T9). Cohérent.
- **Anti-hallucination** : la forme de l'API vision Claude est vérifiée en T5
  (skill claude-api) avant commit.
- **Pas de placeholder** : chaque étape porte le code réel.
- **Note d'exécution** : `test:rls` en séquentiel (déjà configuré) ; storage
  requis pour T2 et T6.
