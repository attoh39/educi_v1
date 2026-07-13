# EduCI 2a — Capture & envoi des copies : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au parent de photographier les copies d'un devoir, les compresser, les mettre en file locale (reprise manuelle), les téléverser dans un bucket Storage privé scopé par parent, et enregistrer une soumission liée au devoir.

**Architecture:** Bucket Supabase Storage privé `copies` avec policies scopées par le 1er segment de chemin (= `auth.uid()`) ; table `submissions` au patron `homework_requests` (RLS durcie + GRANTs). Côté client, feature `src/features/copies/` : utils purs testés (dimensions, chemin), file IndexedDB, orchestration d'envoi, deux pages (liste des devoirs, capture).

**Tech Stack:** React + Vite + TS strict, Vitest + RTL, Supabase Storage + PostgREST, idb-keyval, zod. Branche `phase-2a`. Stack Supabase locale **avec le service storage démarré** (nécessaire à la Task 2).

**Prérequis exécution :** `npx supabase status` OK ; le conteneur **storage** doit tourner (pour la Task 2, ne pas exclure storage au `supabase start`). Node 24 pour `test:rls`.

---

## Structure de fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `supabase/migrations/20260713120000_copies.sql` | bucket + policies Storage + table submissions | créé |
| `supabase/tests/rls-copies.test.ts` | isolation submissions + policies Storage | créé |
| `src/features/copies/compression.ts` | `dimensionsCibles` (pur) + `compresserImage` (canvas) | créé |
| `src/features/copies/compression.test.ts` | test des dimensions | créé |
| `src/features/copies/chemin.ts` | `cheminCopie` (pur) | créé |
| `src/features/copies/chemin.test.ts` | test du chemin | créé |
| `src/features/copies/api.ts` | upload Storage + submissions | créé |
| `src/features/copies/api.test.ts` | test api (mocks) | créé |
| `src/features/copies/copiesQueue.ts` | file IndexedDB | créé |
| `src/features/copies/copiesQueue.test.ts` | test file | créé |
| `src/features/copies/envoi.ts` | orchestration d'envoi | créé |
| `src/features/copies/envoi.test.ts` | test orchestration | créé |
| `src/i18n/fr.ts` | textes | + section `copies` |
| `src/features/devoirs/DevoirsPage.tsx` | liste des devoirs d'un enfant | créé |
| `src/features/copies/CaptureCopiesPage.tsx` | capture + envoi | créé |
| `src/routes.tsx` | routes | + 2 routes |
| `src/features/children/ChildrenPage.tsx` | lien « Devoirs » | modifié |
| `src/lib/database.types.ts` | types générés | régénéré |

---

### Task 1 : Migration — bucket Storage, policies, table submissions

**Files:**
- Create: `supabase/migrations/20260713120000_copies.sql`
- Modify: `src/lib/database.types.ts` (régénéré)

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260713120000_copies.sql` :
```sql
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
```

- [ ] **Step 2 : Appliquer et linter**

Run: `npx supabase db reset`
Expected: les trois migrations s'appliquent sans erreur.
Run: `npx supabase db lint`
Expected: `No schema errors found`.

- [ ] **Step 3 : Régénérer les types**

Run: `npx supabase gen types typescript --local > src/lib/database.types.ts`
Ouvre le fichier et vérifie qu'il contient bien la table `submissions`.

- [ ] **Step 4 : Vérifier le projet**

Run: `npm run typecheck && npm run test:run -- src/domain/classes.sqlsync`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260713120000_copies.sql src/lib/database.types.ts
git commit -m "feat: bucket Storage copies, policies et table submissions"
```

---

### Task 2 : Tests d'isolation (submissions + Storage)

**Files:**
- Create: `supabase/tests/rls-copies.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `supabase/tests/rls-copies.test.ts` :
```ts
import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function parentAvecDevoir(tag: string) {
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
  const { data: req } = await client.from('homework_requests').insert({
    parent_id: id, child_id: childId, mode: 'primaire', contenu: { message: 'x' },
    enrollment_id: (await client.from('enrollments').select('id').eq('child_id', childId).single()).data!.id,
  }).select('id').single();
  const { data: hw } = await client.from('homeworks').insert({
    request_id: req!.id, parent_id: id, child_id: childId,
    enrollment_id: (await client.from('enrollments').select('id').eq('child_id', childId).single()).data!.id,
    exercices: { matieres: [] }, corrige: [], profil: 'cp_ce1', prompt_version: 'v1', modele: 'claude-sonnet-5',
  }).select('id').single();
  return { client, id, childId: childId as string, homeworkId: hw!.id as string };
}

describe('Isolation des copies', () => {
  let a: Awaited<ReturnType<typeof parentAvecDevoir>>;
  let b: Awaited<ReturnType<typeof parentAvecDevoir>>;

  beforeAll(async () => {
    a = await parentAvecDevoir('ca');
    b = await parentAvecDevoir('cb');
    await a.client.from('submissions').insert({
      parent_id: a.id, child_id: a.childId, homework_id: a.homeworkId, photo_paths: [`${a.id}/x/y/z.jpg`],
    });
  });

  it('le parent B ne voit pas les soumissions du parent A', async () => {
    const { data } = await b.client.from('submissions').select('*');
    expect(data).toHaveLength(0);
  });

  it('le parent B ne peut pas insérer une soumission chez A', async () => {
    const { error } = await b.client.from('submissions').insert({
      parent_id: a.id, child_id: a.childId, homework_id: a.homeworkId, photo_paths: [],
    });
    expect(error).not.toBeNull();
  });

  it('un parent téléverse sous son préfixe et se relit', async () => {
    const blob = new Blob(['img'], { type: 'image/jpeg' });
    const chemin = `${a.id}/${a.childId}/${a.homeworkId}/p1.jpg`;
    const up = await a.client.storage.from('copies').upload(chemin, blob, { contentType: 'image/jpeg' });
    expect(up.error).toBeNull();
    const list = await a.client.storage.from('copies').list(`${a.id}/${a.childId}/${a.homeworkId}`);
    expect(list.data?.some((f) => f.name === 'p1.jpg')).toBe(true);
  });

  it('le parent B ne peut ni lister ni téléverser sous le préfixe de A', async () => {
    const listB = await b.client.storage.from('copies').list(`${a.id}/${a.childId}/${a.homeworkId}`);
    expect(listB.data ?? []).toHaveLength(0);
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const up = await b.client.storage.from('copies').upload(`${a.id}/pirate.jpg`, blob, { contentType: 'image/jpeg' });
    expect(up.error).not.toBeNull();
  });
});
```

- [ ] **Step 2 : Exécuter (stack avec storage, Node 24)**

S'assurer que le service storage tourne : `npx supabase status` doit lister l'API Storage. Sinon (re)démarrer sans exclure storage.
Run: `npm run test:rls`
Expected: les suites socle (8) + devoirs (6) + copies (4) passent = **18 tests**.

- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/rls-copies.test.ts
git commit -m "test: isolation RLS submissions et policies Storage des copies"
```

---

### Task 3 : Utils purs — dimensions de compression et chemin (TDD)

**Files:**
- Create: `src/features/copies/compression.ts`, `src/features/copies/compression.test.ts`, `src/features/copies/chemin.ts`, `src/features/copies/chemin.test.ts`

- [ ] **Step 1 : Tests**

Créer `src/features/copies/compression.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { dimensionsCibles } from './compression';

describe('dimensionsCibles', () => {
  it('ne redimensionne pas sous la largeur max', () => {
    expect(dimensionsCibles(800, 600, 1600)).toEqual({ largeur: 800, hauteur: 600 });
  });
  it('réduit en conservant le ratio', () => {
    expect(dimensionsCibles(3200, 2400, 1600)).toEqual({ largeur: 1600, hauteur: 1200 });
  });
});
```
Créer `src/features/copies/chemin.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { cheminCopie } from './chemin';

describe('cheminCopie', () => {
  it('construit parentId/childId/homeworkId/id.jpg', () => {
    expect(cheminCopie('p', 'c', 'h', 'u')).toBe('p/c/h/u.jpg');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/copies/compression src/features/copies/chemin`
Expected: FAIL (modules absents).

- [ ] **Step 3 : Implémenter**

Créer `src/features/copies/chemin.ts` :
```ts
export function cheminCopie(parentId: string, childId: string, homeworkId: string, id: string): string {
  return `${parentId}/${childId}/${homeworkId}/${id}.jpg`;
}
```
Créer `src/features/copies/compression.ts` :
```ts
export function dimensionsCibles(
  largeur: number,
  hauteur: number,
  maxLargeur = 1600,
): { largeur: number; hauteur: number } {
  if (largeur <= maxLargeur) return { largeur, hauteur };
  const ratio = maxLargeur / largeur;
  return { largeur: maxLargeur, hauteur: Math.round(hauteur * ratio) };
}

// Compression réelle (navigateur). Non testée sous jsdom (canvas absent) ;
// vérifiée en E2E. La logique risquée (dimensions) est isolée et testée.
export async function compresserImage(fichier: Blob, maxLargeur = 1600, qualite = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(fichier);
  const { largeur, hauteur } = dimensionsCibles(bitmap.width, bitmap.height, maxLargeur);
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compression'))), 'image/jpeg', qualite),
  );
}
```

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/copies/compression src/features/copies/chemin && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/copies/compression.ts src/features/copies/compression.test.ts src/features/copies/chemin.ts src/features/copies/chemin.test.ts
git commit -m "feat: utils de compression (dimensions) et de chemin des copies"
```

---

### Task 4 : API copies (Storage + submissions) (TDD)

**Files:**
- Create: `src/features/copies/api.ts`, `src/features/copies/api.test.ts`

- [ ] **Step 1 : Test**

Créer `src/features/copies/api.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpload = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a) }) },
    from: (...a: unknown[]) => mockFrom(...a),
    auth: { getUser: () => mockGetUser() },
  },
}));

import { creerSoumission, listerSoumissions, televerserCopie } from './api';

beforeEach(() => vi.clearAllMocks());

describe('televerserCopie', () => {
  it('téléverse le blob et propage une erreur', async () => {
    mockUpload.mockResolvedValue({ error: null });
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await televerserCopie('p/c/h/u.jpg', blob);
    expect(mockUpload).toHaveBeenCalledWith('p/c/h/u.jpg', blob, { contentType: 'image/jpeg', upsert: false });
    mockUpload.mockResolvedValue({ error: new Error('boom') });
    await expect(televerserCopie('p/c/h/u.jpg', blob)).rejects.toThrow('boom');
  });
});

describe('creerSoumission', () => {
  it('insère la soumission avec le parent de la session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'parent-1' } } });
    const single = vi.fn().mockResolvedValue({ data: { id: 's1' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    mockFrom.mockReturnValue({ insert });
    const s = await creerSoumission('h1', 'c1', ['p/c/h/u.jpg']);
    expect(s.id).toBe('s1');
    expect(mockFrom).toHaveBeenCalledWith('submissions');
    expect(insert).toHaveBeenCalledWith({
      parent_id: 'parent-1', child_id: 'c1', homework_id: 'h1',
      photo_paths: ['p/c/h/u.jpg'], statut: 'envoye',
    });
  });
});

describe('listerSoumissions', () => {
  it('liste par devoir, plus récentes d’abord', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    const data = await listerSoumissions('h1');
    expect(data).toEqual([]);
    expect(eq).toHaveBeenCalledWith('homework_id', 'h1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/copies/api`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/copies/api.ts` :
```ts
import { supabase } from '../../lib/supabase';

export type Soumission = {
  id: string;
  homework_id: string;
  photo_paths: string[];
  statut: string;
  created_at: string;
};

export async function televerserCopie(chemin: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from('copies').upload(chemin, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
}

export async function creerSoumission(
  homeworkId: string,
  childId: string,
  photoPaths: string[],
): Promise<Soumission> {
  const { data: userData } = await supabase.auth.getUser();
  const parentId = userData.user!.id;
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      parent_id: parentId, child_id: childId, homework_id: homeworkId,
      photo_paths: photoPaths, statut: 'envoye',
    })
    .select('id, homework_id, photo_paths, statut, created_at')
    .single();
  if (error) throw error;
  return data as Soumission;
}

export async function listerSoumissions(homeworkId: string): Promise<Soumission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, homework_id, photo_paths, statut, created_at')
    .eq('homework_id', homeworkId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Soumission[];
}
```

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/copies/api && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/copies/api.ts src/features/copies/api.test.ts
git commit -m "feat: API copies (upload Storage, création et liste des soumissions)"
```

---

### Task 5 : File d'attente IndexedDB (TDD)

**Files:**
- Create: `src/features/copies/copiesQueue.ts`, `src/features/copies/copiesQueue.test.ts`

- [ ] **Step 1 : Test**

Créer `src/features/copies/copiesQueue.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
}));

import { ajouterEnFile, lireFile, retirerDeFile } from './copiesQueue';

beforeEach(() => store.clear());

describe('file des copies', () => {
  it('ajoute, lit puis retire un élément', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const item = await ajouterEnFile('h1', blob);
    expect((await lireFile('h1')).map((e) => e.id)).toEqual([item.id]);
    await retirerDeFile('h1', item.id);
    expect(await lireFile('h1')).toEqual([]);
  });
  it('isole les files par devoir', async () => {
    await ajouterEnFile('h1', new Blob(['a']));
    expect(await lireFile('h2')).toEqual([]);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/copies/copiesQueue`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/copies/copiesQueue.ts` :
```ts
import { get, set } from 'idb-keyval';

export type ElementFile = { id: string; blob: Blob };

const cle = (homeworkId: string) => `copies:file:${homeworkId}`;

export async function ajouterEnFile(homeworkId: string, blob: Blob): Promise<ElementFile> {
  const item: ElementFile = { id: crypto.randomUUID(), blob };
  const file = (await get<ElementFile[]>(cle(homeworkId))) ?? [];
  await set(cle(homeworkId), [...file, item]);
  return item;
}

export async function lireFile(homeworkId: string): Promise<ElementFile[]> {
  return (await get<ElementFile[]>(cle(homeworkId))) ?? [];
}

export async function retirerDeFile(homeworkId: string, id: string): Promise<void> {
  const file = (await get<ElementFile[]>(cle(homeworkId))) ?? [];
  await set(cle(homeworkId), file.filter((e) => e.id !== id));
}
```

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/copies/copiesQueue && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/copies/copiesQueue.ts src/features/copies/copiesQueue.test.ts
git commit -m "feat: file d'attente IndexedDB des copies"
```

---

### Task 6 : Orchestration d'envoi (TDD)

**Files:**
- Create: `src/features/copies/envoi.ts`, `src/features/copies/envoi.test.ts`

- [ ] **Step 1 : Test**

Créer `src/features/copies/envoi.test.ts` :
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTeleverser = vi.fn();
vi.mock('./api', () => ({ televerserCopie: (...a: unknown[]) => mockTeleverser(...a) }));
vi.mock('./chemin', () => ({ cheminCopie: (p: string, c: string, h: string, id: string) => `${p}/${c}/${h}/${id}.jpg` }));

import { envoyerElements } from './envoi';

beforeEach(() => vi.clearAllMocks());

const el = (id: string) => ({ id, blob: new Blob(['x'], { type: 'image/jpeg' }) });

describe('envoyerElements', () => {
  it('téléverse chaque élément et retourne les chemins envoyés', async () => {
    mockTeleverser.mockResolvedValue(undefined);
    const r = await envoyerElements('p', 'c', 'h', [el('a'), el('b')]);
    expect(r.envoyes).toEqual(['p/c/h/a.jpg', 'p/c/h/b.jpg']);
    expect(r.echoues).toEqual([]);
  });
  it('collecte les échecs sans interrompre les suivants', async () => {
    mockTeleverser
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const r = await envoyerElements('p', 'c', 'h', [el('a'), el('b')]);
    expect(r.envoyes).toEqual(['p/c/h/b.jpg']);
    expect(r.echoues).toEqual(['a']);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/copies/envoi`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

Créer `src/features/copies/envoi.ts` :
```ts
import { televerserCopie } from './api';
import { cheminCopie } from './chemin';
import type { ElementFile } from './copiesQueue';

export type ResultatEnvoi = { envoyes: string[]; echoues: string[] };

// Téléverse chaque élément ; poursuit malgré les échecs (réseau instable).
export async function envoyerElements(
  parentId: string,
  childId: string,
  homeworkId: string,
  elements: ElementFile[],
): Promise<ResultatEnvoi> {
  const envoyes: string[] = [];
  const echoues: string[] = [];
  for (const e of elements) {
    const chemin = cheminCopie(parentId, childId, homeworkId, e.id);
    try {
      await televerserCopie(chemin, e.blob);
      envoyes.push(chemin);
    } catch {
      echoues.push(e.id);
    }
  }
  return { envoyes, echoues };
}
```

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/copies/envoi && npm run typecheck`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/copies/envoi.ts src/features/copies/envoi.test.ts
git commit -m "feat: orchestration d'envoi des copies (poursuite malgré échecs)"
```

---

### Task 7 : Textes UI des copies

**Files:**
- Modify: `src/i18n/fr.ts`

- [ ] **Step 1 : Ajouter la section**

Dans `src/i18n/fr.ts`, ajouter une section `copies` juste après la section `devoirs` (après sa `},` fermante, avant la section suivante) :
```ts
  copies: {
    devoirsTitre: 'Devoirs de l’enfant',
    aucunDevoir: 'Aucun devoir généré pour l’instant.',
    envoyerCopies: 'Envoyer les copies',
    captureTitre: 'Photographier les copies',
    ajouterPhoto: 'Ajouter une photo',
    enFile: 'photo(s) en attente d’envoi',
    envoyer: 'Envoyer',
    envoiEnCours: 'Envoi…',
    reessayer: 'Réessayer',
    envoiReussi: 'Copies envoyées. La correction sera bientôt disponible.',
    envoiPartiel: 'Certaines photos n’ont pas pu être envoyées. Réessayez.',
  },
```

- [ ] **Step 2 : Vérifier et committer**

Run: `npm run typecheck && npm run lint && npm run test:run`
Expected: PASS.
```bash
git add src/i18n/fr.ts
git commit -m "feat: textes UI de la capture des copies"
```

---

### Task 8 : Page « Devoirs » + route + lien depuis les enfants (TDD)

**Files:**
- Create: `src/features/devoirs/DevoirsPage.tsx`, `src/features/devoirs/DevoirsPage.test.tsx`
- Modify: `src/routes.tsx`, `src/features/children/ChildrenPage.tsx`

- [ ] **Step 1 : Test**

Créer `src/features/devoirs/DevoirsPage.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const mockLister = vi.fn();
vi.mock('./api', () => ({ listerDevoirs: (...a: unknown[]) => mockLister(...a) }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1' }),
}));

import { DevoirsPage } from './DevoirsPage';

function rendre() {
  return render(<MemoryRouter><DevoirsPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('liste les devoirs avec un accès à l’envoi des copies', async () => {
  mockLister.mockResolvedValue([
    { id: 'h1', exercices: { matieres: [] }, created_at: '2026-07-13T10:00:00Z' },
  ]);
  rendre();
  expect(await screen.findByRole('link', { name: 'Envoyer les copies' })).toHaveAttribute(
    'href', '/enfants/c1/devoirs/h1/copies',
  );
});

it('affiche l’état vide', async () => {
  mockLister.mockResolvedValue([]);
  rendre();
  expect(await screen.findByText('Aucun devoir généré pour l’instant.')).toBeInTheDocument();
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/DevoirsPage`
Expected: FAIL.

- [ ] **Step 3 : Implémenter la page**

Créer `src/features/devoirs/DevoirsPage.tsx` :
```tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import { listerDevoirs, type DevoirListe } from './api';

export function DevoirsPage() {
  const { childId } = useParams();
  const [devoirs, setDevoirs] = useState<DevoirListe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    listerDevoirs(childId)
      .then(setDevoirs)
      .catch(() => setErreur(fr.commun.erreurInconnue));
  }, [childId]);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.copies.devoirsTitre}</h2>
      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
      {devoirs === null && !erreur && <p className="text-slate-500">{fr.commun.chargement}</p>}
      {devoirs?.length === 0 && <p className="text-slate-500">{fr.copies.aucunDevoir}</p>}
      <ul className="space-y-2">
        {devoirs?.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm text-slate-600">
              {new Date(d.created_at).toLocaleDateString('fr-FR')}
            </span>
            <Link
              to={`/enfants/${childId}/devoirs/${d.id}/copies`}
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
            >
              {fr.copies.envoyerCopies}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4 : Câbler la route**

Dans `src/routes.tsx`, importer et ajouter la route :
```tsx
import { DevoirsPage } from './features/devoirs/DevoirsPage';
```
Dans le tableau `children` de l'AppShell, après la ligne `/enfants/:childId/devoir` :
```tsx
          { path: '/enfants/:childId/devoirs', element: <DevoirsPage /> },
```

- [ ] **Step 5 : Lien depuis la liste des enfants**

Dans `src/features/children/ChildrenPage.tsx`, sous le `<Link>` « Générer un devoir » (dans le même `<li>`, juste après la fermeture `</Link>` du bloc existant), ajouter un second lien :
```tsx
              {inscription && (
                <Link
                  to={`/enfants/${e.id}/devoirs`}
                  className="mt-2 ml-2 inline-block rounded-lg border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-700"
                >
                  {fr.copies.devoirsTitre}
                </Link>
              )}
```

- [ ] **Step 6 : Vérifier**

Run: `npm run test:run -- src/features/devoirs/DevoirsPage && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7 : Commit**

```bash
git add src/features/devoirs/DevoirsPage.tsx src/features/devoirs/DevoirsPage.test.tsx src/routes.tsx src/features/children/ChildrenPage.tsx
git commit -m "feat: page Devoirs par enfant et accès à l'envoi des copies"
```

---

### Task 9 : Page de capture (TDD)

**Files:**
- Create: `src/features/copies/CaptureCopiesPage.tsx`, `src/features/copies/CaptureCopiesPage.test.tsx`
- Modify: `src/routes.tsx`

- [ ] **Step 1 : Test**

Créer `src/features/copies/CaptureCopiesPage.test.tsx` :
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const mockCompresser = vi.fn();
const mockEnvoyer = vi.fn();
const mockCreer = vi.fn();
vi.mock('./compression', () => ({ compresserImage: (...a: unknown[]) => mockCompresser(...a) }));
vi.mock('./envoi', () => ({ envoyerElements: (...a: unknown[]) => mockEnvoyer(...a) }));
vi.mock('./api', () => ({ creerSoumission: (...a: unknown[]) => mockCreer(...a) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'parent-1' } } }) }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1', homeworkId: 'h1' }),
}));

import { CaptureCopiesPage } from './CaptureCopiesPage';

function rendre() {
  return render(<MemoryRouter><CaptureCopiesPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('ajoute une photo puis envoie et confirme', async () => {
  mockCompresser.mockResolvedValue(new Blob(['z'], { type: 'image/jpeg' }));
  mockEnvoyer.mockResolvedValue({ envoyes: ['parent-1/c1/h1/u.jpg'], echoues: [] });
  mockCreer.mockResolvedValue({ id: 's1' });
  rendre();
  const fichier = new File(['x'], 'copie.jpg', { type: 'image/jpeg' });
  await userEvent.upload(screen.getByLabelText('Ajouter une photo'), fichier);
  await waitFor(() => expect(screen.getByText(/1 photo/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  expect(await screen.findByText(/Copies envoyées/)).toBeInTheDocument();
  expect(mockCreer).toHaveBeenCalledWith('h1', 'c1', ['parent-1/c1/h1/u.jpg']);
});

it('affiche un envoi partiel en cas d’échec', async () => {
  mockCompresser.mockResolvedValue(new Blob(['z'], { type: 'image/jpeg' }));
  mockEnvoyer.mockResolvedValue({ envoyes: [], echoues: ['u'] });
  rendre();
  const fichier = new File(['x'], 'copie.jpg', { type: 'image/jpeg' });
  await userEvent.upload(screen.getByLabelText('Ajouter une photo'), fichier);
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  expect(await screen.findByText(/Certaines photos/)).toBeInTheDocument();
  expect(mockCreer).not.toHaveBeenCalled();
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/copies/CaptureCopiesPage`
Expected: FAIL.

- [ ] **Step 3 : Implémenter la page**

Créer `src/features/copies/CaptureCopiesPage.tsx` :
```tsx
import { useRef, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import { useAuth } from '../auth/AuthProvider';
import { compresserImage } from './compression';
import { envoyerElements } from './envoi';
import { creerSoumission } from './api';
import type { ElementFile } from './copiesQueue';

type Etat = 'saisie' | 'envoi' | 'reussi' | 'partiel';

export function CaptureCopiesPage() {
  const { childId, homeworkId } = useParams();
  const { session } = useAuth();
  const parentId = session?.user.id ?? '';
  const [elements, setElements] = useState<ElementFile[]>([]);
  const [etat, setEtat] = useState<Etat>('saisie');
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
      setEtat('partiel');
      enVol.current = false;
      return;
    }
    await creerSoumission(homeworkId, childId, envoyes);
    setElements([]);
    setEtat('reussi');
    enVol.current = false;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.copies.captureTitre}</h2>

      {etat === 'reussi' ? (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {fr.copies.envoiReussi}
        </p>
      ) : (
        <>
          <label className="block">
            <span className="inline-block rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white">
              {fr.copies.ajouterPhoto}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={onAjout}
              className="sr-only"
              aria-label={fr.copies.ajouterPhoto}
            />
          </label>

          <p className="text-sm text-slate-600">{elements.length} {fr.copies.enFile}</p>

          {etat === 'partiel' && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {fr.copies.envoiPartiel}
            </p>
          )}

          <button
            type="button"
            onClick={onEnvoi}
            disabled={etat === 'envoi' || elements.length === 0}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {etat === 'envoi' ? fr.copies.envoiEnCours : etat === 'partiel' ? fr.copies.reessayer : fr.copies.envoyer}
          </button>
        </>
      )}
    </section>
  );
}
```
Note : le message « 1 photo(s) en attente d'envoi » satisfait `getByText(/1 photo/)`. Le test « partiel » ne remet pas en cause la file (la reprise relance `onEnvoi` sur les mêmes `elements`).

- [ ] **Step 4 : Câbler la route**

Dans `src/routes.tsx`, importer et ajouter la route :
```tsx
import { CaptureCopiesPage } from './features/copies/CaptureCopiesPage';
```
Après la ligne `/enfants/:childId/devoirs` :
```tsx
          { path: '/enfants/:childId/devoirs/:homeworkId/copies', element: <CaptureCopiesPage /> },
```

- [ ] **Step 5 : Vérifier**

Run: `npm run test:run -- src/features/copies/CaptureCopiesPage && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/features/copies/CaptureCopiesPage.tsx src/features/copies/CaptureCopiesPage.test.tsx src/routes.tsx
git commit -m "feat: page de capture et d'envoi des copies"
```

---

### Task 10 : Vérification finale et documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1 : Vérification complète**

Run: `npm run lint && npm run typecheck && npm run test:run && npm run build && npm run test:rls`
Expected: tout PASS. `test:run` couvre les nouveaux tests copies ; `test:rls` = 18 tests (socle 8 + devoirs 6 + copies 4).

- [ ] **Step 2 : README**

Dans `README.md`, à la fin de la section « Génération de devoirs (Edge Function) » (avant `## Scripts`), ajouter :
```markdown

### Envoi des copies (2a)

Le parent ouvre « Devoirs » depuis la fiche d'un enfant, choisit un devoir et
photographie les copies. Les images sont compressées côté client, mises en file
locale (reprise manuelle si hors ligne) et téléversées dans le bucket privé
`copies` (chemin `parentId/childId/homeworkId/…`, accès restreint par policies
Storage). Une ligne `submissions` référence le devoir et les photos. La
correction IA de ces copies est le sous-plan 2b.
```

- [ ] **Step 3 : Commit**

```bash
git add README.md
git commit -m "docs: envoi des copies (capture, file locale, Storage privé)"
```

---

## Critère de fin

Un parent ouvre « Devoirs » depuis un enfant, choisit un devoir, photographie une
ou plusieurs pages ; les images sont compressées, téléversées sous son préfixe
privé, et une soumission `envoye` est créée. Un autre parent ne peut lire ni les
fichiers ni la soumission (prouvé par les tests d'isolation, submissions +
Storage). En cas d'échec réseau, la reprise renvoie sans reprendre les photos.
Vérification complète verte.

## Self-review (writing-plans)

- **Couverture spec** : bucket + policies Storage (T1), submissions RLS durcie
  (T1), tests isolation submissions + Storage (T2), compression/chemin (T3), API
  Storage + submissions (T4), file locale (T5), orchestration reprise (T6), i18n
  (T7), navigation Devoirs (T8), capture + reprise (T9), vérif + doc (T10).
  Toutes les sections du design sont couvertes.
- **Types** : `ElementFile` (T5) consommé par `envoyerElements` (T6) et la page
  (T9) ; `cheminCopie` (T3) par l'orchestration (T6) ; `Soumission`/`creerSoumission`
  (T4) par la page (T9) ; `DevoirListe`/`listerDevoirs` (existant) par T8 ; clés
  `fr.copies.*` (T7) par T8/T9. Cohérent.
- **Pas de placeholder** : chaque étape porte le code réel.
- **Note d'exécution** : la Task 2 exige le conteneur **storage** actif ; si la
  stack locale a été démarrée en excluant storage, la redémarrer sans `-x storage`.
