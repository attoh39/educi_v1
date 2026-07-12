# EduCI 1B-b — Génération mode secondaire : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre la génération de devoirs au secondaire (collège/lycée) : formulaire un champ par matière, profils par matière × cycle, contrôle noté /20, en réutilisant l'Edge Function, le schéma, le rendu et les quotas de 1B-a.

**Architecture:** On ajoute une branche « secondaire » à l'Edge Function `generate-homework` existante (un seul appel Claude regroupant les matières renseignées), un champ `points?` optionnel au schéma partagé, des profils secondaires détaillés, et côté client une page qui bascule primaire/secondaire avec un gabarit « Contrôle ». Tables, RLS et quotas inchangés.

**Tech Stack:** React + Vite + TS strict, Vitest + RTL, Deno (Edge Functions), zod, Supabase local. Branche `phase-1b-b`.

**Prérequis exécution :** stack Supabase locale démarrée (`npx supabase status`), Deno installé, Node 24 pour `test:rls`/`deno test` réseau.

---

## Structure de fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `src/features/devoirs/schema.ts` | schéma devoir client | + `points?` |
| `supabase/functions/_shared/devoir.ts` | schéma devoir Edge + JSON Schema | + `points?` |
| `supabase/functions/_shared/profils.ts` | profils pédagogiques | + secondaires |
| `supabase/functions/_shared/profils.test.ts` | test profils | créé |
| `supabase/functions/generate-homework/index.ts` | orchestration | + branche secondaire |
| `supabase/functions/generate-homework/handler.test.ts` | test intégration | + test secondaire |
| `src/features/devoirs/api.ts` | API client | signature union |
| `src/features/devoirs/api.test.ts` | test API | maj union |
| `src/i18n/fr.ts` | textes | + secondaire |
| `src/features/devoirs/DevoirDocument.tsx` | rendu imprimable | + variante Contrôle |
| `src/features/devoirs/DevoirDocument.test.tsx` | test rendu | + secondaire |
| `src/features/devoirs/GenerateHomeworkPage.tsx` | page génération | détection mode + form secondaire |
| `src/features/devoirs/GenerateHomeworkPage.test.tsx` | test page | + secondaire |
| `src/features/children/ChildrenPage.tsx` | liste enfants | passe `matieres` dans l'état |

---

### Task 1 : Champ `points?` optionnel (schéma client + Edge)

**Files:**
- Modify: `src/features/devoirs/schema.ts`, `src/features/devoirs/schema.test.ts`, `supabase/functions/_shared/devoir.ts`

- [ ] **Step 1 : Ajouter les tests (client)**

Dans `src/features/devoirs/schema.test.ts`, ajouter à la fin du `describe('devoirSchema', …)` (avant sa `});` finale) :
```ts
  it('accepte un exercice avec un barème points', () => {
    const x = structuredClone(valide);
    (x.matieres[0].exercices[0] as { points?: number }).points = 3;
    expect(devoirSchema.safeParse(x).success).toBe(true);
  });
  it('refuse un points négatif', () => {
    const x = structuredClone(valide);
    (x.matieres[0].exercices[0] as { points?: number }).points = -1;
    expect(devoirSchema.safeParse(x).success).toBe(false);
  });
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/schema`
Expected: le test « accepte … points » passe déjà (zod ignore les clés inconnues) mais « refuse un points négatif » ÉCHOUE (points non validé).

- [ ] **Step 3 : Implémenter (client)**

Dans `src/features/devoirs/schema.ts`, dans `exerciceSchema`, ajouter la ligne `points` après `espaceReponse` :
```ts
const exerciceSchema = z.object({
  numero: z.number().int().positive(),
  consigne: z.string().min(1),
  type: z.enum(TYPES_EXERCICE),
  items: z.array(z.string()),
  espaceReponse: z.enum(ESPACES_REPONSE),
  points: z.number().int().nonnegative().optional(),
});
```

- [ ] **Step 4 : Vérifier (client)**

Run: `npm run test:run -- src/features/devoirs/schema`
Expected: PASS (tous).

- [ ] **Step 5 : Implémenter (Edge)**

Dans `supabase/functions/_shared/devoir.ts` :
- Dans le `z.object({ … })` de l'exercice (celui avec `numero`, `consigne`, `type`, `items`, `espaceReponse`), ajouter après `espaceReponse` :
```ts
              points: z.number().int().nonnegative().optional(),
```
- Dans `DEVOIR_JSON_SCHEMA`, dans `properties` de l'exercice (à côté de `espaceReponse`), ajouter :
```ts
                points: { type: 'integer' },
```
  Ne PAS ajouter `points` au tableau `required` de l'exercice (il reste optionnel).

- [ ] **Step 6 : Vérifier Deno**

Run: `deno check --node-modules-dir=none supabase/functions/_shared/devoir.ts`
Expected: aucune erreur.

- [ ] **Step 7 : Commit**

```bash
git add src/features/devoirs/schema.ts src/features/devoirs/schema.test.ts supabase/functions/_shared/devoir.ts
git commit -m "feat: champ points optionnel par exercice (barème du contrôle)"
```

---

### Task 2 : Profils secondaires par matière × cycle

**Files:**
- Modify: `supabase/functions/_shared/profils.ts`
- Create: `supabase/functions/_shared/profils.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `supabase/functions/_shared/profils.test.ts` :
```ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { profilSecondaire, PROMPT_VERSION_SECONDAIRE } from './profils.ts';

Deno.test('profilSecondaire assemble préambule + règles des matières présentes', () => {
  const p = profilSecondaire('college', ['Mathématiques', 'Français']);
  assert(p);
  assertEquals(p.cle, 'college');
  assert(p.texte.includes('collège'));
  assert(p.texte.includes('Mathématiques'));
  assert(p.texte.includes('Français'));
});

Deno.test('profilSecondaire : matière sans règle dédiée retombe sur le préambule', () => {
  const p = profilSecondaire('lycee', ['MatièreInconnue']);
  assert(p);
  assert(p.texte.includes('lycée'));
});

Deno.test('profilSecondaire retourne null hors collège/lycée', () => {
  assertEquals(profilSecondaire('cp_ce1', ['Français']), null);
});

Deno.test('PROMPT_VERSION_SECONDAIRE est distinct', () => {
  assertEquals(PROMPT_VERSION_SECONDAIRE, 'secondaire-v1');
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `deno test --node-modules-dir=none supabase/functions/_shared/profils.test.ts`
Expected: FAIL (exports `profilSecondaire` / `PROMPT_VERSION_SECONDAIRE` absents).

- [ ] **Step 3 : Implémenter**

Dans `supabase/functions/_shared/profils.ts`, ajouter à la fin du fichier (après `profilPourCycle`) :
```ts

// --- Secondaire (collège / lycée) : profils par matière × cycle ---
export const PROMPT_VERSION_SECONDAIRE = 'secondaire-v1';

export type CycleSecondaire = 'college' | 'lycee';

const COMMUN_SECONDAIRE = `Tu es un concepteur de contrôles scolaires pour la Côte d'Ivoire.
Tu produis un contrôle à imprimer sur papier pour un élève du secondaire, à partir du contenu de cours fourni par le parent, matière par matière.
Règles générales :
- Réponds UNIQUEMENT avec un objet JSON conforme au schéma imposé, sans texte autour.
- Rédige en français, dans le style d'un contrôle scolaire.
- Regroupe les exercices par matière, dans l'ordre fourni.
- Numérote les exercices par matière en commençant à 1.
- Attribue à chaque exercice un barème entier dans "points" ; par matière, la somme des points vaut 20.
- Fournis systématiquement un corrigé complet et détaillé dans "corrige".
- N'invente pas de matière absente de la saisie du parent.`;

const PREAMBULE: Record<CycleSecondaire, string> = {
  college: `${COMMUN_SECONDAIRE}
Niveau : collège (6e-3e, 11-15 ans). Présentation de contrôle, consignes claires et progressives,
exercices d'application et petits problèmes. espaceReponse "lignes" ou "cadre" selon l'exercice.`,
  lycee: `${COMMUN_SECONDAIRE}
Niveau : lycée (2de-Tle, 15-18 ans). Prépare aux examens : exercices analytiques, raisonnement,
corrigés très détaillés. espaceReponse "lignes" le plus souvent.`,
};

const REGLES: Record<CycleSecondaire, Record<string, string>> = {
  college: {
    'Français': 'Français : compréhension de texte, conjugaison, grammaire, courte rédaction.',
    'Mathématiques': 'Mathématiques : calcul, géométrie, équations simples, problèmes.',
    'Anglais': 'Anglais : compréhension, vocabulaire, grammaire, courtes phrases à produire.',
    'SVT': 'SVT : questions de cours, schéma à légender, observation.',
    'Physique-Chimie': "Physique-Chimie : questions de cours, exercices d'application, unités.",
    'Histoire-Géographie': 'Histoire-Géographie : questions de cours, repères, courte analyse de document.',
    'EDHC': 'EDHC : questions sur les valeurs civiques et morales, cas pratiques.',
  },
  lycee: {
    'Français': 'Français : commentaire de texte, dissertation courte, figures de style.',
    'Mathématiques': 'Mathématiques : fonctions, algèbre, géométrie analytique, démonstrations.',
    'Anglais': 'Anglais : compréhension avancée, expression écrite argumentée, grammaire.',
    'SVT': 'SVT : raisonnement scientifique, exploitation de documents, schémas.',
    'Physique-Chimie': "Physique-Chimie : exercices quantitatifs, formules, analyse d'expérience.",
    'Histoire-Géographie': 'Histoire-Géographie : composition, analyse de documents, croquis.',
    'Philosophie': 'Philosophie : explication de texte ou dissertation, problématisation, argumentation.',
    'Informatique': 'Informatique : algorithmique, notions de programmation, logique.',
  },
};

export function profilSecondaire(
  cycle: string,
  matieres: string[],
): { texte: string; cle: CycleSecondaire } | null {
  if (cycle !== 'college' && cycle !== 'lycee') return null;
  const regles = matieres
    .map((m) => REGLES[cycle][m])
    .filter((r): r is string => Boolean(r));
  const texte = regles.length > 0
    ? `${PREAMBULE[cycle]}\nRègles par matière :\n- ${regles.join('\n- ')}`
    : PREAMBULE[cycle];
  return { texte, cle: cycle };
}
```

- [ ] **Step 4 : Vérifier le passage**

Run: `deno test --node-modules-dir=none supabase/functions/_shared/profils.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/_shared/profils.ts supabase/functions/_shared/profils.test.ts
git commit -m "feat: profils pédagogiques secondaires par matière et par cycle"
```

---

### Task 3 : Branche secondaire de l'Edge Function

**Files:**
- Modify: `supabase/functions/generate-homework/index.ts`, `supabase/functions/generate-homework/handler.test.ts`

- [ ] **Step 1 : Remplacer `index.ts`**

Remplacer intégralement `supabase/functions/generate-homework/index.ts` par :
```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { devoirSchema, DEVOIR_JSON_SCHEMA } from '../_shared/devoir.ts';
import {
  profilPourCycle, profilSecondaire, PROMPT_VERSION, PROMPT_VERSION_SECONDAIRE,
} from '../_shared/profils.ts';
import { genererJson, MODELE } from '../_shared/claude.ts';

const GENERATIONS_PAR_SEMAINE = 10;

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
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });
}

type Preparation = {
  systeme: string;
  message: string;
  profilCle: string;
  promptVersion: string;
  mode: 'primaire' | 'secondaire';
  contenu: Record<string, unknown>;
};

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

  let corps: {
    childId?: string;
    message?: string;
    matieres?: { matiere?: string; contenu?: string }[];
  };
  try {
    corps = await req.json();
  } catch {
    return reponseJson({ erreur: 'corps invalide' }, 400);
  }
  if (!corps.childId) return reponseJson({ erreur: 'saisie invalide' }, 400);

  // Inscription active de l'enfant (RLS garantit l'appartenance au parent).
  const { data: enr } = await supabase
    .from('enrollments')
    .select('id, classe, matieres')
    .eq('child_id', corps.childId)
    .eq('is_active', true)
    .single();
  if (!enr) return reponseJson({ erreur: 'enfant introuvable' }, 404);

  const cycle = CYCLES[enr.classe as string];
  const mode: 'primaire' | 'secondaire' =
    cycle === 'college' || cycle === 'lycee' ? 'secondaire' : 'primaire';

  let prep: Preparation;
  if (mode === 'primaire') {
    const message = (corps.message ?? '').trim();
    if (message.length < 3) return reponseJson({ erreur: 'saisie invalide' }, 400);
    const profil = cycle ? profilPourCycle(cycle) : null;
    if (!profil) return reponseJson({ erreur: 'niveau non pris en charge' }, 400);
    prep = {
      systeme: profil.texte, message, profilCle: profil.cle,
      promptVersion: PROMPT_VERSION, mode: 'primaire', contenu: { message },
    };
  } else {
    const permises = new Set((enr.matieres as string[] | null) ?? []);
    const presentes = (Array.isArray(corps.matieres) ? corps.matieres : [])
      .map((m) => ({ matiere: String(m.matiere ?? ''), contenu: String(m.contenu ?? '').trim() }))
      .filter((m) => m.contenu.length >= 3 && permises.has(m.matiere));
    if (presentes.length === 0) return reponseJson({ erreur: 'saisie invalide' }, 400);
    const profil = profilSecondaire(cycle, presentes.map((m) => m.matiere));
    if (!profil) return reponseJson({ erreur: 'niveau non pris en charge' }, 400);
    const message = presentes.map((m) => `Matière : ${m.matiere}\n${m.contenu}`).join('\n\n');
    prep = {
      systeme: profil.texte, message, profilCle: profil.cle,
      promptVersion: PROMPT_VERSION_SECONDAIRE, mode: 'secondaire',
      contenu: { matieres: presentes },
    };
  }

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
      mode: prep.mode, contenu: prep.contenu, statut: 'generation',
    })
    .select('id')
    .single();
  if (eReq || !request) return reponseJson({ erreur: 'création demande' }, 500);

  const resultat = await genererJson({
    systeme: prep.systeme,
    message: prep.message,
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
      profil: prep.profilCle, prompt_version: prep.promptVersion, modele: MODELE,
      cout_tokens_entree: resultat.tokensEntree, cout_tokens_sortie: resultat.tokensSortie,
    })
    .select('id, exercices')
    .single();
  if (eHw || !devoir) return reponseJson({ erreur: 'persistance devoir' }, 500);

  await supabase.from('homework_requests').update({ statut: 'pret' }).eq('id', request.id);
  await supabase.rpc('incrementer_quota', { p_child_id: corps.childId, p_semaine_iso: semaine });

  return reponseJson({ homeworkId: devoir.id, devoir: devoir.exercices });
}

if (import.meta.main) Deno.serve(handler);
```

- [ ] **Step 2 : Étendre le test d'intégration**

Dans `supabase/functions/generate-homework/handler.test.ts` :

a) Remplacer la fonction `parentAvecEnfant` par une version paramétrée par la classe (le reste du fichier est inchangé) :
```ts
async function parentAvecEnfant(classe = 'CP1', matieres = ['Français']) {
  const email = `hw-${crypto.randomUUID()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password });
  const { data: childId } = await client.rpc('create_child_with_enrollment', {
    p_nom: 'K', p_prenoms: 'L', p_date_naissance: '2019-03-12', p_sexe: 'M',
    p_annee_scolaire: '2026-2027', p_classe: classe, p_etablissement: 'EPP',
    p_systeme: 'IVOIRIEN', p_matieres: matieres,
  });
  return { token: data!.session!.access_token, childId: childId as string };
}
```

b) Ajouter à la fin du fichier un test secondaire :
```ts
Deno.test('génère un contrôle secondaire à partir de plusieurs matières', async () => {
  const faux = fauxServeurClaude();
  Deno.env.set('ANTHROPIC_API_KEY', 'test');
  Deno.env.set('ANTHROPIC_BASE_URL', faux.url);
  try {
    const { token, childId } = await parentAvecEnfant('6EME', ['Français', 'Mathématiques']);
    const req = new Request('http://local/generate-homework', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        childId,
        matieres: [
          { matiere: 'Mathématiques', contenu: 'Les fractions et les nombres décimaux.' },
          { matiere: 'Anglais', contenu: 'ignorée car hors inscription' },
        ],
      }),
    });
    const res = await handler(req);
    assertEquals(res.status, 200);
    const corps = await res.json();
    assertEquals(corps.devoir.matieres[0].nom, 'Français');
  } finally {
    faux.stop();
  }
});

Deno.test('secondaire : refuse une saisie sans matière valide', async () => {
  const { token, childId } = await parentAvecEnfant('6EME', ['Français', 'Mathématiques']);
  const req = new Request('http://local/generate-homework', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ childId, matieres: [{ matiere: 'Mathématiques', contenu: 'x' }] }),
  });
  const res = await handler(req);
  assertEquals(res.status, 400);
});
```
Note : le premier test secondaire renvoie le `DEVOIR_FIXE` du faux serveur (matière « Français ») quel que soit le message — on vérifie donc le chemin complet (branche secondaire → persistance), pas l'adéquation du contenu. Le second prouve le rejet (`contenu` « x » trop court → aucune matière valide → 400).

- [ ] **Step 3 : Exécuter**

Récupérer les clés : `npx supabase status -o env`. Puis (Git Bash) :
```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_ROLE_KEY=<service_role> \
deno test --node-modules-dir=none --allow-net --allow-env supabase/functions/generate-homework/handler.test.ts
```
Expected: 4 tests PASS (2 primaires existants + 2 secondaires).

- [ ] **Step 4 : Commit**

```bash
git add supabase/functions/generate-homework
git commit -m "feat: branche secondaire de l'Edge Function (contrôle multi-matières)"
```

---

### Task 4 : API client en union (+ mise à jour du site d'appel primaire)

**Files:**
- Modify: `src/features/devoirs/api.ts`, `src/features/devoirs/api.test.ts`, `src/features/devoirs/GenerateHomeworkPage.tsx`, `src/features/devoirs/GenerateHomeworkPage.test.tsx`

- [ ] **Step 1 : Mettre à jour les tests de l'API**

Dans `src/features/devoirs/api.test.ts`, remplacer le corps du `it('invoque la fonction avec childId et message', …)` et ajouter un test secondaire :
```ts
  it('invoque la fonction en mode primaire', async () => {
    mockInvoke.mockResolvedValue({ data: { homeworkId: 'h1', devoir: { matieres: [] } }, error: null });
    const r = await genererDevoir('c1', { mode: 'primaire', message: 'Français : syllabes' });
    expect(r.homeworkId).toBe('h1');
    expect(mockInvoke).toHaveBeenCalledWith('generate-homework', {
      body: { childId: 'c1', message: 'Français : syllabes' },
    });
  });
  it('invoque la fonction en mode secondaire', async () => {
    mockInvoke.mockResolvedValue({ data: { homeworkId: 'h2', devoir: { matieres: [] } }, error: null });
    await genererDevoir('c1', { mode: 'secondaire', matieres: [{ matiere: 'Maths', contenu: 'fractions' }] });
    expect(mockInvoke).toHaveBeenCalledWith('generate-homework', {
      body: { childId: 'c1', matieres: [{ matiere: 'Maths', contenu: 'fractions' }] },
    });
  });
```
Et dans le test « propage le statut de quota », remplacer l'appel :
```ts
    await expect(genererDevoir('c1', { mode: 'primaire', message: 'msg valide' })).rejects.toMatchObject({ code: 'quota' });
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/api`
Expected: FAIL (signature actuelle `(childId, message: string)`).

- [ ] **Step 3 : Implémenter l'API union**

Dans `src/features/devoirs/api.ts`, remplacer la fonction `genererDevoir` (et ajouter le type `SaisieDevoir` juste avant) :
```ts
export type SaisieDevoir =
  | { mode: 'primaire'; message: string }
  | { mode: 'secondaire'; matieres: { matiere: string; contenu: string }[] };

export async function genererDevoir(childId: string, saisie: SaisieDevoir): Promise<DevoirGenere> {
  const body = saisie.mode === 'primaire'
    ? { childId, message: saisie.message }
    : { childId, matieres: saisie.matieres };
  const { data, error } = await supabase.functions.invoke('generate-homework', { body });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) throw new GenerationError('quota');
    throw new GenerationError('echec');
  }
  return data as DevoirGenere;
}
```

- [ ] **Step 4 : Mettre à jour le site d'appel primaire (page + test)**

Dans `src/features/devoirs/GenerateHomeworkPage.tsx`, remplacer la ligne d'appel :
```ts
      const r = await genererDevoir(childId, message.trim());
```
par :
```ts
      const r = await genererDevoir(childId, { mode: 'primaire', message: message.trim() });
```
Dans `src/features/devoirs/GenerateHomeworkPage.test.tsx`, remplacer l'assertion :
```ts
  expect(mockGenerer).toHaveBeenCalledWith('c1', 'Français : syllabes MA ME');
```
par :
```ts
  expect(mockGenerer).toHaveBeenCalledWith('c1', { mode: 'primaire', message: 'Français : syllabes MA ME' });
```

- [ ] **Step 5 : Vérifier**

Run: `npm run test:run -- src/features/devoirs && npm run typecheck`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/features/devoirs/api.ts src/features/devoirs/api.test.ts src/features/devoirs/GenerateHomeworkPage.tsx src/features/devoirs/GenerateHomeworkPage.test.tsx
git commit -m "refactor: API de génération en saisie union (primaire/secondaire)"
```

---

### Task 5 : Textes UI du mode secondaire

**Files:**
- Modify: `src/i18n/fr.ts`

- [ ] **Step 1 : Ajouter les clés**

Dans `src/i18n/fr.ts`, section `devoirs`, ajouter ces clés (avant la clé `entete`) :
```ts
    titreControle: 'Générer un contrôle',
    instructionSecondaire: 'Remplissez les matières dont vous avez reçu le cours (les autres peuvent rester vides).',
    genererControle: 'Générer le contrôle',
    controle: 'Contrôle',
    noteSur: 'Noté sur 20',
    pointsUnite: 'pts',
```

- [ ] **Step 2 : Vérifier**

Run: `npm run typecheck && npm run lint && npm run test:run`
Expected: PASS (aucun consommateur encore ; les tests restent verts).

- [ ] **Step 3 : Commit**

```bash
git add src/i18n/fr.ts
git commit -m "feat: textes UI du mode secondaire"
```

---

### Task 6 : Gabarit « Contrôle » noté dans DevoirDocument (TDD)

**Files:**
- Modify: `src/features/devoirs/DevoirDocument.tsx`, `src/features/devoirs/DevoirDocument.test.tsx`

- [ ] **Step 1 : Écrire le test**

Dans `src/features/devoirs/DevoirDocument.test.tsx`, ajouter à la fin :
```ts
it('en mode secondaire affiche Contrôle, le barème /20 et les points par exercice', () => {
  const controle: Devoir = {
    matieres: [{
      nom: 'Mathématiques',
      exercices: [
        { numero: 1, consigne: 'Calcule.', type: 'calcul', items: [], espaceReponse: 'cadre', points: 12 },
        { numero: 2, consigne: 'Résous.', type: 'calcul', items: [], espaceReponse: 'cadre', points: 8 },
      ],
    }],
  };
  render(<DevoirDocument devoir={controle} eleve="L K" classe="6EME" date="12/07/2026" variante="secondaire" />);
  expect(screen.getByText('Contrôle')).toBeInTheDocument();
  expect(screen.getByText(/Noté sur 20/)).toBeInTheDocument();
  expect(screen.getByText(/12 pts/)).toBeInTheDocument();
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/DevoirDocument`
Expected: FAIL (prop `variante` inconnue, textes absents).

- [ ] **Step 3 : Implémenter**

Remplacer intégralement `src/features/devoirs/DevoirDocument.tsx` par :
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
  variante?: 'primaire' | 'secondaire';
}) {
  const { devoir, eleve, classe, date, variante = 'primaire' } = props;
  const classeTexte = (CLASSES as readonly string[]).includes(String(classe))
    ? classeLabel(classe as Classe)
    : String(classe);
  const secondaire = variante === 'secondaire';

  return (
    <article className="devoir-document mx-auto max-w-[210mm] bg-white p-6 text-slate-900">
      <header className="mb-4 border-b-2 border-teal-700 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold text-teal-700">{fr.app.nom}</h1>
          {secondaire && (
            <span className="text-base font-bold text-slate-700">
              {fr.devoirs.controle} — {fr.devoirs.noteSur}
            </span>
          )}
        </div>
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
                <p className="font-medium">
                  {ex.numero}. {ex.consigne}
                  {secondaire && ex.points != null && (
                    <span className="ml-2 font-normal text-slate-500">({ex.points} {fr.devoirs.pointsUnite})</span>
                  )}
                </p>
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

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/features/devoirs/DevoirDocument && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/devoirs/DevoirDocument.tsx src/features/devoirs/DevoirDocument.test.tsx
git commit -m "feat: gabarit Contrôle noté /20 pour le secondaire"
```

---

### Task 7 : Page — détection du mode et formulaire secondaire (TDD)

**Files:**
- Modify: `src/features/devoirs/GenerateHomeworkPage.tsx`, `src/features/devoirs/GenerateHomeworkPage.test.tsx`, `src/features/children/ChildrenPage.tsx`

- [ ] **Step 1 : Réécrire le test**

Remplacer intégralement `src/features/devoirs/GenerateHomeworkPage.test.tsx` par :
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

let etatNav: { eleve?: string; classe?: string; matieres?: string[] } = { eleve: 'Lamine K', classe: 'CP1' };
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ childId: 'c1' }),
  useLocation: () => ({ state: etatNav }),
}));

import { GenerateHomeworkPage } from './GenerateHomeworkPage';

function rendre() {
  return render(<MemoryRouter><GenerateHomeworkPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  etatNav = { eleve: 'Lamine K', classe: 'CP1' };
});

it('mode primaire : génère un devoir et l’affiche', async () => {
  mockGenerer.mockResolvedValue({
    homeworkId: 'h1',
    devoir: { matieres: [{ nom: 'Français', exercices: [{ numero: 1, consigne: 'Lis.', type: 'ecriture', items: [], espaceReponse: 'lignes' }] }] },
  });
  rendre();
  await userEvent.type(screen.getByLabelText('Générer un devoir'), 'Français : syllabes MA ME');
  await userEvent.click(screen.getByRole('button', { name: 'Générer le devoir' }));
  expect(await screen.findByText('Français')).toBeInTheDocument();
  expect(mockGenerer).toHaveBeenCalledWith('c1', { mode: 'primaire', message: 'Français : syllabes MA ME' });
});

it('mode primaire : affiche le quota atteint', async () => {
  const { GenerationError } = await import('./api');
  mockGenerer.mockRejectedValue(new GenerationError('quota'));
  rendre();
  await userEvent.type(screen.getByLabelText('Générer un devoir'), 'Français : syllabes');
  await userEvent.click(screen.getByRole('button', { name: 'Générer le devoir' }));
  expect(await screen.findByText(/Quota de la semaine atteint/)).toBeInTheDocument();
});

it('mode secondaire : un champ par matière, n’envoie que les matières remplies', async () => {
  etatNav = { eleve: 'Awa T', classe: '6EME', matieres: ['Français', 'Mathématiques'] };
  mockGenerer.mockResolvedValue({
    homeworkId: 'h2',
    devoir: { matieres: [{ nom: 'Mathématiques', exercices: [{ numero: 1, consigne: 'Calcule.', type: 'calcul', items: [], espaceReponse: 'cadre', points: 20 }] }] },
  });
  rendre();
  await userEvent.type(screen.getByLabelText('Mathématiques'), 'Les fractions.');
  await userEvent.click(screen.getByRole('button', { name: 'Générer le contrôle' }));
  expect(await screen.findByText('Contrôle')).toBeInTheDocument();
  expect(mockGenerer).toHaveBeenCalledWith('c1', {
    mode: 'secondaire',
    matieres: [{ matiere: 'Mathématiques', contenu: 'Les fractions.' }],
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/devoirs/GenerateHomeworkPage`
Expected: FAIL (mode secondaire non géré).

- [ ] **Step 3 : Réécrire la page**

Remplacer intégralement `src/features/devoirs/GenerateHomeworkPage.tsx` par :
```tsx
import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { fr } from '../../i18n/fr';
import { CLASSES, modeGenerationOf, type Classe } from '../../domain/classes';
import { mettreEnCacheDevoir } from '../../lib/devoirsCache';
import { DevoirDocument } from './DevoirDocument';
import { genererDevoir, GenerationError, type SaisieDevoir } from './api';
import type { Devoir } from './schema';

export function GenerateHomeworkPage() {
  const { childId } = useParams();
  const location = useLocation() as { state?: { eleve?: string; classe?: string; matieres?: string[] } };
  const eleve = location.state?.eleve ?? '';
  const classe = (location.state?.classe ?? '') as Classe | string;
  const matieresInscription = location.state?.matieres ?? [];

  const estClasseConnue = (CLASSES as readonly string[]).includes(String(classe));
  const mode = estClasseConnue ? modeGenerationOf(classe as Classe) : 'primaire';

  const [message, setMessage] = useState('');
  const [parMatiere, setParMatiere] = useState<Record<string, string>>({});
  const [devoir, setDevoir] = useState<Devoir | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const enVol = useRef(false);

  function saisieSecondaire(): { matiere: string; contenu: string }[] {
    return matieresInscription
      .map((m) => ({ matiere: m, contenu: (parMatiere[m] ?? '').trim() }))
      .filter((m) => m.contenu.length > 0);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (enVol.current || !childId) return;
    let saisie: SaisieDevoir;
    if (mode === 'primaire') {
      saisie = { mode: 'primaire', message: message.trim() };
    } else {
      const matieres = saisieSecondaire();
      if (matieres.length === 0) return;
      saisie = { mode: 'secondaire', matieres };
    }
    enVol.current = true;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await genererDevoir(childId, saisie);
      await mettreEnCacheDevoir(r.homeworkId, r.devoir);
      setDevoir(r.devoir);
    } catch (err) {
      setErreur(err instanceof GenerationError && err.code === 'quota' ? fr.devoirs.quotaAtteint : fr.devoirs.echec);
    } finally {
      enVol.current = false;
      setEnCours(false);
    }
  }

  const dateDuJour = new Date().toLocaleDateString('fr-FR');
  const titre = mode === 'primaire' ? fr.devoirs.titre : fr.devoirs.titreControle;
  const boutonGenerer = mode === 'primaire' ? fr.devoirs.generer : fr.devoirs.genererControle;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{titre}</h2>

      {!devoir && mode === 'primaire' && (
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
            {enCours ? fr.devoirs.generationEnCours : boutonGenerer}
          </button>
        </form>
      )}

      {!devoir && mode === 'secondaire' && (
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-sm text-slate-500">{fr.devoirs.instructionSecondaire}</p>
          {matieresInscription.map((m) => (
            <label key={m} className="block text-sm font-medium text-slate-700">
              {m}
              <textarea
                value={parMatiere[m] ?? ''}
                onChange={(e) => setParMatiere((p) => ({ ...p, [m]: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-base"
              />
            </label>
          ))}
          <button type="submit" disabled={enCours}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {enCours ? fr.devoirs.generationEnCours : boutonGenerer}
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
          <DevoirDocument devoir={devoir} eleve={eleve} classe={classe} date={dateDuJour} variante={mode} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4 : Passer `matieres` depuis la liste des enfants**

Dans `src/features/children/ChildrenPage.tsx`, dans le `<Link>` de génération, ajouter `matieres` à l'état de navigation. Remplacer :
```tsx
                  state={{ eleve: `${e.prenoms} ${e.nom}`, classe: inscription.classe }}
```
par :
```tsx
                  state={{ eleve: `${e.prenoms} ${e.nom}`, classe: inscription.classe, matieres: inscription.matieres }}
```

- [ ] **Step 5 : Vérifier**

Run: `npm run test:run -- src/features/devoirs/GenerateHomeworkPage && npm run typecheck && npm run lint`
Expected: PASS (3 tests page).

- [ ] **Step 6 : Commit**

```bash
git add src/features/devoirs/GenerateHomeworkPage.tsx src/features/devoirs/GenerateHomeworkPage.test.tsx src/features/children/ChildrenPage.tsx
git commit -m "feat: formulaire secondaire multi-matières et détection du mode"
```

---

### Task 8 : Vérification finale et documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1 : Vérification finale automatisée**

Run: `npm run lint && npm run typecheck && npm run test:run && npm run build && npm run test:rls`
Expected: tout PASS. (Les tests RLS sont inchangés depuis 1B-a — 14 tests.)

Run aussi les tests Deno :
```bash
deno test --node-modules-dir=none supabase/functions/_shared/profils.test.ts
```
Expected: 4 PASS. (Le test d'intégration `handler.test.ts` a déjà été exécuté en Task 3.)

- [ ] **Step 2 : Compléter le README**

Dans `README.md`, section « Génération de devoirs (Edge Function) », après la ligne des tests Deno de l'Edge Function, ajouter :
```markdown

Le mode secondaire (collège/lycée) réutilise la même fonction : le corps est
`{ childId, matieres: [{ matiere, contenu }] }` au lieu de `{ childId, message }`.
Le mode est déterminé côté serveur d'après la classe de l'enfant.
```

- [ ] **Step 3 : Commit**

```bash
git add README.md
git commit -m "docs: mode secondaire de l'Edge Function de génération"
```

---

## Critère de fin

Un parent d'un élève au secondaire renseigne une ou plusieurs matières de
l'inscription et obtient, en une génération décomptée du quota, un contrôle noté
/20 adapté au niveau et aux disciplines, imprimable en PDF ; le corrigé est
stocké mais jamais imprimé ; les matières hors inscription sont ignorées côté
serveur ; l'isolation RLS reste prouvée ; le devoir est consultable hors ligne.
Vérification complète verte (lint, typecheck, tests unitaires, build, RLS,
tests Deno).

## Self-review (writing-plans)

- **Couverture spec** : points? (T1), profils secondaires (T2), branche Edge +
  filtre matières d'inscription (T3), API union + site primaire (T4), i18n (T5),
  gabarit Contrôle /20 (T6), formulaire multi-matières + mode + ChildrenPage
  (T7), vérif finale + doc (T8). Toutes les sections du design sont couvertes.
- **Cohérence des types** : `SaisieDevoir` (T4) consommé par la page (T7) ;
  `profilSecondaire`/`PROMPT_VERSION_SECONDAIRE` (T2) consommés par l'Edge (T3) ;
  prop `variante` (T6) passée par la page (T7) ; clés `fr.devoirs.*` (T5)
  consommées par T6/T7. Champ `points?` (T1) lu par T6.
- **Pas de placeholder** : chaque étape porte le code réel.
