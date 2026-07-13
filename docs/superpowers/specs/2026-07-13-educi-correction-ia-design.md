# EduCI 2b — Correction IA des copies : design

**Date :** 2026-07-13
**Statut :** validé (backend, Edge Function, client)
**Base :** `main` = socle 1A + génération 1B-a/1B-b + capture 2a (`5d82e7b`).
**Portée :** second sous-plan de la correction automatique (Plan 2). 2b corrige
les copies **déjà envoyées** en 2a : Claude Sonnet 5 vision lit l'écriture,
compare au corrigé stocké, produit une note (secondaire) ou une appréciation
(primaire) et un feedback par exercice. Le dossier pédagogique (`skill_records`)
reste un plan ultérieur.

---

## 1. Objectif

Depuis une soumission de copies (`submissions`, statut `envoye`, photos dans le
bucket privé `copies`), le parent lance la correction. Une Edge Function lit
l'énoncé + le corrigé stockés du devoir (`homeworks.exercices` + `.corrige`) et
les photos, les envoie à Claude vision, et persiste une correction structurée.

**Critère de fin :** un parent ayant envoyé des copies lance la correction et
obtient, en une correction décomptée d'un quota hebdomadaire **dédié**, une note
/20 (secondaire) ou une appréciation qualitative (primaire), plus un feedback par
exercice (réussi / partiel / à revoir + explication + bonne réponse) ; en cas
d'échec (photos illisibles), le quota n'est pas consommé et la soumission passe
en `echec` ; un autre parent ne voit jamais cette correction (RLS).

## 2. Décisions validées

| Sujet | Décision |
|---|---|
| Images → Claude | **Base64** (téléchargées côté serveur, jamais d'URL publique) |
| Déclenchement | **Synchrone** (le client attend, indicateur de chargement) |
| Quota | Compteur **corrections/semaine séparé** sur `usage_quotas` |
| Modèle | **Claude Sonnet 5** (vision) |
| Note | /20 au secondaire, `null` + appréciation au primaire |
| Corrigé | **Montré** au parent (contrairement à la génération) |

## 3. Backend

### 3.1 Migration

- **Table `corrections`** :
  ```
  corrections (
    id uuid pk,
    submission_id uuid → submissions unique,
    homework_id uuid → homeworks,
    parent_id uuid → parents,
    child_id uuid → children,
    note numeric(4,1),         -- nullable (primaire) ; /20, demi-points permis
    appreciation text not null,
    details jsonb not null,
    modele text not null,
    prompt_version text not null,
    cout_tokens_entree integer not null default 0,
    cout_tokens_sortie integer not null default 0,
    created_at timestamptz not null default now()
  )
  ```
  Index sur `parent_id`, `submission_id`. RLS `for all using (parent_id =
  auth.uid())` avec `with check` vérifiant aussi l'appartenance de l'enfant
  (`exists … children`). GRANTs DML `authenticated`, rien à `anon`.
- **Quota corrections** : `alter table usage_quotas add column corrections
  integer not null default 0;` + RPC `incrementer_correction(p_child_id,
  p_semaine_iso)` (upsert : insert `generations=0, corrections=1` on conflict do
  update `corrections = corrections + 1`, retourne le total après incrément),
  `security invoker`, `search_path = public`.

### 3.2 Tests backend

- RLS `corrections` : isolation entre parents, refus de rattachement à l'enfant
  d'un autre parent.
- `incrementer_correction` : crée puis incrémente pour le bon parent, sans
  toucher `generations` ; un parent ne peut pas incrémenter pour l'enfant d'un
  autre (WITH CHECK durci).

## 4. Edge Function `correct-submission`

Nouvelle fonction (patron `generate-homework`, auth JWT, RLS via client anon +
Authorization).

1. Corps `{ submissionId }`. Lit `submissions` (RLS → propriété) : `homework_id`,
   `child_id`, `enrollment_id`, `photo_paths`.
2. Lit `homeworks` : `exercices`, `corrige`, + la classe de l'enrollment → cycle
   → mode (primaire/secondaire).
3. Vérifie le quota corrections (sans incrémenter). Si atteint → 429.
4. **Télécharge chaque photo** via `supabase.storage.from('copies').download()`
   (le JWT du parent donne accès à son préfixe), convertit en base64.
5. Marque la soumission `correction`. Appelle Claude Sonnet 5 vision : système =
   profil de correction du mode ; message utilisateur = énoncé + corrigé (texte)
   + blocs image base64. Sortie structurée (JSON Schema) validée par zod.
6. Succès → persiste `corrections`, soumission `corrige`, incrémente le quota
   corrections. Échec (Claude ou zod) → soumission `echec`, **quota non
   consommé**, réponse 502.

**Modules `_shared`** :
- `_shared/claude.ts` étendu : `genererJson` accepte un paramètre optionnel
  `images: string[]` (base64) ; si présent, le contenu utilisateur devient un
  tableau `[{type:'text',…}, {type:'image', source:{type:'base64',…}}, …]`. Le
  chemin texte-seul reste inchangé (génération non impactée).
- `_shared/correction.ts` (nouveau) : `correctionSchema` (zod),
  `CORRECTION_JSON_SCHEMA`, `PROMPT_VERSION_CORRECTION`, et
  `profilCorrection(mode)` (préambule de correction : lire l'écriture d'enfant,
  comparer au corrigé fourni, verdict par exercice, note /20 au secondaire =
  somme des points obtenus, appréciation qualitative bienveillante au primaire ;
  toujours fournir explication et bonne réponse par exercice).

## 5. Schéma de correction (partagé)

`src/features/correction/schema.ts` (client) et `_shared/correction.ts` (Edge),
maintenus synchrones :
```
correction = {
  note: number | null,          // /20 au secondaire ; null au primaire
  appreciation: string,          // commentaire global
  details: [{
    matiere: string,
    numero: number,
    statut: 'reussi' | 'partiel' | 'a_revoir',
    explication: string,
    bonneReponse: string,
  }],
}
```

## 6. Client

- **`src/features/copies/api.ts`** : `corrigerSoumission(submissionId):
  Promise<Correction>` → `supabase.functions.invoke('correct-submission', { body:
  { submissionId } })`, avec `GenerationError`-like (`quota` / `echec`).
- **Flux (extension de `CaptureCopiesPage`)** : après un envoi réussi (2a), la
  page conserve le `submissionId` retourné et affiche un bouton **« Lancer la
  correction »**. Au clic → `corrigerSoumission` (indicateur), puis affichage du
  résultat via **`CorrectionDocument`**. Gestion « quota atteint » et « échec »
  (réessayer). Garde anti-double-appel (`useRef`).
- **`CorrectionDocument`** : en-tête (note /20 si présente, sinon appréciation),
  puis par exercice : matière + numéro, badge coloré `reussi` (vert) / `partiel`
  (ambre) / `a_revoir` (rouge), explication, bonne réponse. Corrigé visible.
- **i18n** : section `correction` dans `fr.ts`.

## 7. Sécurité & confidentialité

- Photos téléchargées **côté serveur** et transmises en **base64** dans l'appel
  Anthropic chiffré — aucune URL publique exposée.
- RLS sur `submissions`, `homeworks`, `corrections` : le parent n'accède qu'à ses
  données ; la fonction utilise le JWT du parent (jamais la service key).
- Quota corrections appliqué côté serveur ; échec de lecture ⇒ pas de décompte.
- La clé Claude reste un secret de l'Edge Function.

## 8. Tests

- **Backend** : RLS corrections + `incrementer_correction` (intégration).
- **Edge Function** : test d'intégration Deno avec faux serveur Claude (renvoie
  une correction) et Storage local réel — un parent corrige une soumission,
  vérifie la persistance `corrections` + statut `corrige` + quota incrémenté ;
  cas quota atteint ; cas échec Claude → `echec` sans décompte.
- **Schéma** : `correctionSchema` (zod) valide/rejette.
- **Client** : `CorrectionDocument` (RTL, badges par statut), déclenchement dans
  la page (RTL, mocks). Vérification finale complète (lint, typecheck, tests,
  build, tests RLS).

## 9. Hors périmètre (2b)

- Dossier pédagogique `skill_records` (alimenté par les corrections) → plan
  ultérieur (prépare le Coach IA).
- Correction asynchrone (file + polling).
- Re-correction / historique multiple par soumission (une correction par
  soumission, `submission_id` unique).
