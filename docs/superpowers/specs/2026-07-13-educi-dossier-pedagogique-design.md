# EduCI 3 — Dossier pédagogique : design

**Date :** 2026-07-13
**Statut :** validé (extension correction, backend, client)
**Base :** `main` = 1A + 1B-a/1B-b + 2a/2b (`26adcc3`).
**Portée :** construit la **mémoire pédagogique** de chaque enfant à partir des
corrections. Le **Coach IA** (analyses, recommandations) et le **tableau de bord
graphique** (courbes d'évolution) sont des plans ultérieurs qui liront ces
données.

---

## 1. Objectif

Après chaque correction (2b), EduCI enregistre les **compétences/notions**
travaillées et leur niveau de maîtrise, par enfant et par matière, avec un
historique daté. Le parent consulte un « dossier » listant l'état des acquis.

**Critère de fin :** après une correction, les compétences détectées par l'IA
alimentent `skill_records` (niveau courant par compétence) et `skill_events`
(observations datées) ; le parent ouvre le dossier de son enfant et voit les
compétences groupées par matière avec leur maîtrise ; un autre parent ne voit
jamais ces données (RLS). L'échec de l'enregistrement des compétences n'annule
pas la correction déjà persistée.

## 2. Décisions validées

| Sujet | Décision |
|---|---|
| Extraction des compétences | **Même appel** de correction (Claude étiquette) |
| Modèle de maîtrise | **Niveau courant** (`skill_records`) + **historique** (`skill_events`) |
| Règle de maîtrise | Dernière observation ; `observations` incrémenté ; historique complet conservé |
| Vue | Page **« Dossier »** minimale (sans graphiques) |

## 3. Extension de la correction (évolution de 2b)

Le schéma de correction partagé gagne un champ `competences`. Les deux contrats
restent synchrones :
- `src/features/correction/schema.ts` (client) ;
- `supabase/functions/_shared/correction.ts` (Edge) + `CORRECTION_JSON_SCHEMA`.

```
correction = {
  note?: number,
  appreciation: string,
  details: [...],                       // inchangé
  competences: [{ matiere: string, libelle: string, maitrise: Maitrise }],
}
Maitrise = 'acquis' | 'en_cours' | 'fragile'
```

- `CORRECTION_JSON_SCHEMA` : ajout de `competences` (array d'objets `matiere`
  string, `libelle` string, `maitrise` string enum
  `acquis`/`en_cours`/`fragile`) ; `competences` **requis** (peut être vide `[]`).
- `profilCorrection` : instruction ajoutée — « identifie 1 à 3 compétences ou
  notions clés travaillées par matière (libellés courts, ex. "additions jusqu'à
  100", "accord du participe passé"), avec leur maîtrise : acquis / en cours /
  fragile ».
- `PROMPT_VERSION_CORRECTION` → `correction-v2`.

Le champ `competences` **n'est pas** stocké dans `corrections` (il alimente
`skill_records`/`skill_events`) ; il est renvoyé au client pour l'appel de
l'enregistrement, ou consommé directement par l'Edge Function (voir §5).

## 4. Backend

### 4.1 Tables

- **`skill_records`** — niveau courant par compétence :
  ```
  (id, parent_id → parents, child_id → children, matiere text, competence text,
   maitrise maitrise_niveau, observations integer default 1, updated_at timestamptz)
  unique (child_id, matiere, competence)
  ```
- **`skill_events`** — historique daté (append-only) :
  ```
  (id, parent_id → parents, child_id → children, correction_id → corrections,
   matiere text, competence text, maitrise maitrise_niveau, created_at timestamptz)
  ```
- Enum `maitrise_niveau = ('acquis','en_cours','fragile')`.
- Index : `skill_records (child_id)`, `skill_events (child_id, matiere)`.
- RLS `for all using (parent_id = auth.uid())` + `with check` avec appartenance
  de l'enfant (`exists … children`) sur les deux tables. GRANTs DML
  `authenticated`, rien à `anon`.

### 4.2 RPC

`enregistrer_competence(p_child_id uuid, p_correction_id uuid, p_matiere text,
p_competence text, p_maitrise maitrise_niveau) returns void`, `security invoker`,
`search_path = public` :
1. `insert into skill_events (parent_id=auth.uid(), child_id, correction_id, matiere, competence, maitrise)` ;
2. `insert into skill_records (parent_id=auth.uid(), child_id, matiere, competence, maitrise, observations=1)
   on conflict (child_id, matiere, competence) do update set
   maitrise = excluded.maitrise, observations = skill_records.observations + 1, updated_at = now()`.

La RLS s'applique (auth.uid()), donc un parent ne peut enregistrer que pour son
propre enfant (WITH CHECK durci).

## 5. Edge Function (mise à jour de `correct-submission`)

Après avoir persisté la `correction` et mis la soumission à `corrige`, la
fonction parcourt `parsed.data.competences` et appelle
`supabase.rpc('enregistrer_competence', …)` pour chacune (avec `correction.id`).
Ces appels sont **best-effort** : une erreur y est journalisée mais **ne change
pas** le statut `corrige` ni la réponse (la correction reste valide). Le quota
corrections reste décompté comme en 2b.

## 6. Client

- **`src/features/dossier/api.ts`** : `listerCompetences(childId):
  Promise<SkillRecord[]>` → `skill_records` de l'enfant, triés par matière puis
  compétence.
- **`DossierPage`** (`/enfants/:childId/dossier`) : compétences **groupées par
  matière**, chacune avec un badge de maîtrise (acquis vert / en cours ambre /
  fragile rouge) et le nombre d'observations ; état vide « Aucune donnée : faites
  corriger des copies. ».
- **`ChildrenPage`** : lien « Dossier » par enfant.
- **i18n** : section `dossier`.

## 7. Tests

- **Backend** : RLS `skill_records` + `skill_events` (isolation, refus enfant
  d'autrui) ; `enregistrer_competence` (crée event + upsert record, incrémente
  `observations`, met à jour `maitrise`).
- **Correction v2** : schéma client/Edge accepte `competences` ; `_shared`
  profil v2 mentionne les compétences ; extension du test d'intégration
  `correct-submission` — après correction, `skill_records` contient la compétence
  du faux serveur.
- **Client** : `listerCompetences` (mocks), `DossierPage` (RTL, groupement +
  badges). Vérification finale complète (lint, typecheck, tests, build, RLS).

## 8. Hors périmètre

- Coach IA (analyse des `skill_events`, recommandations, plan de la semaine) →
  plan ultérieur.
- Tableau de bord graphique (courbes d'évolution, forces/faiblesses) → plan
  ultérieur (lit `skill_records`/`skill_events`).
- Pondération avancée de la maîtrise (au-delà de « dernière observation »).
