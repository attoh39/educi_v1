# EduCI 2a — Capture & envoi des copies : design

**Date :** 2026-07-13
**Statut :** validé (backend, client, navigation)
**Base :** `main` = socle 1A + génération 1B-a/1B-b (`a232107`).
**Portée :** premier sous-plan de la correction automatique (Plan 2). 2a permet
au parent de **photographier et envoyer** les copies d'un devoir, stockées de
façon sécurisée. La **correction IA** (Claude vision, note, affichage) est le
sous-plan **2b**. Le dossier pédagogique (`skill_records`) est un plan ultérieur.

---

## 1. Objectif

Après qu'un devoir a été généré et imprimé, l'enfant le fait sur papier. Le
parent photographie ensuite les feuilles (une ou plusieurs pages) et les envoie.
2a couvre : capture caméra, compression, file d'attente locale avec reprise
manuelle, upload direct vers Supabase Storage, et enregistrement d'une
**soumission** liée au devoir.

**Critère de fin :** un parent ouvre un devoir généré, photographie une ou
plusieurs pages, les envoie ; les images sont stockées dans un bucket privé
accessible à lui seul, et une ligne `submissions` référence le devoir et les
chemins des photos ; un autre parent ne peut jamais lire ces fichiers ni cette
soumission (prouvé par tests) ; en cas d'échec réseau, le parent relance l'envoi
sans reprendre les photos.

## 2. Décisions validées (Plan 2 global)

| Sujet | Décision |
|---|---|
| Quota correction | Compteur **séparé** `corrections/semaine` (mis en place en **2b**) |
| Stockage | **Bucket privé** + RLS par parent, **upload direct client** |
| Hors ligne | **File locale (IndexedDB) + reprise manuelle** |
| Modèle vision | **Sonnet 5** (en 2b) |
| Note | /20 au secondaire, appréciation qualitative au primaire (en 2b) |

## 3. Backend

### 3.1 Bucket Storage `copies`

- Bucket **privé** (`public = false`) créé par migration SQL
  (`insert into storage.buckets`).
- Convention de chemin : `<parentId>/<childId>/<homeworkId>/<uuid>.jpg`.
- **Policies RLS sur `storage.objects`** (rôle `authenticated`, `bucket_id =
  'copies'`) : un parent ne peut `insert` / `select` / `delete` que les objets
  dont le premier segment de chemin vaut son identifiant :
  `(storage.foldername(name))[1] = auth.uid()::text`. Aucun accès `anon`.

### 3.2 Table `submissions`

```
submission_statut enum : 'envoye' | 'correction' | 'corrige' | 'echec'
submissions (
  id uuid pk,
  parent_id uuid → parents,
  child_id uuid → children,
  homework_id uuid → homeworks,
  photo_paths text[] not null default '{}',
  statut submission_statut not null default 'envoye',
  erreur text,
  created_at timestamptz
)
```
- Index sur `parent_id` et `homework_id`.
- L'enum inclut dès maintenant les statuts de 2b (`correction`/`corrige`/
  `echec`) pour éviter un `alter type` ultérieur ; 2a ne pose que `'envoye'`.
- **RLS** : policy `for all using (parent_id = auth.uid())` avec `with check`
  vérifiant en plus l'appartenance de l'enfant
  (`exists (select 1 from children c where c.id = child_id and c.parent_id =
  auth.uid())`) — même durcissement qu'en 1B. GRANTs DML à `authenticated`,
  rien à `anon`.

### 3.3 Tests backend

- Isolation RLS `submissions` entre deux parents (intégration Supabase local),
  y compris le refus de rattacher une soumission à l'enfant d'un autre parent.
- Policies Storage : le parent A téléverse un objet sous son préfixe et le
  relit ; le parent B ne peut ni lister ni lire l'objet de A ; B ne peut pas
  écrire sous le préfixe de A.

## 4. Client — capture & upload

Nouvelle feature `src/features/copies/`.

### 4.1 Compression

- Module `compresserImage(file): Promise<Blob>` : redimensionne (côté client,
  via `canvas`) à une largeur max (ex. 1600 px) et ré-encode en JPEG qualité
  ~0.8. Testé unitairement (dimensions/format de sortie), avec un canvas mocké.

### 4.2 File d'attente locale + reprise

- Chaque photo capturée est compressée puis ajoutée à une file en **IndexedDB**
  (`idb-keyval`, déjà installé), clé par `homeworkId`. La file survit à un
  rechargement.
- L'upload tente d'envoyer chaque élément vers Storage (chemin
  `parentId/childId/homeworkId/<uuid>.jpg`). Succès → retiré de la file ; échec
  (hors ligne) → conservé, un bouton **« Réessayer »** relance les éléments
  restants.
- Quand tous les éléments sont envoyés, création de la ligne `submissions`
  (`photo_paths` = chemins téléversés, `statut = 'envoye'`).

### 4.3 API (`src/features/copies/api.ts`)

- `televerserCopie(chemin, blob)` : upload Storage.
- `creerSoumission(homeworkId, childId, photoPaths)` : insert `submissions`.
- `listerSoumissions(homeworkId)` : soumissions d'un devoir (pour l'état).

Toute la logique sensible reste bornée par la RLS/Storage policies ; le client
n'écrit que sous son propre préfixe (le chemin est construit avec l'`id` du
parent issu de la session).

## 5. Navigation

- **Page « Devoirs »** par enfant, route `/enfants/:childId/devoirs` :
  réutilise `listerDevoirs` (déjà écrit dans `features/devoirs/api.ts`, non
  encore utilisé) pour lister les devoirs générés de l'enfant ; chaque devoir
  porte un bouton **« Envoyer les copies »**.
- **Page capture**, route `/enfants/:childId/devoirs/:homeworkId/copies` :
  sélection/prise de photos, aperçu de la file, bouton d'envoi, « Réessayer » en
  cas d'échec, confirmation d'envoi.
- Lien d'accès : la liste des enfants (`ChildrenPage`) reçoit un accès
  « Devoirs » par enfant (en plus du « Générer un devoir » existant).
- i18n : section `copies` dans `fr.ts`.

## 6. Tests

- **Backend** : RLS `submissions` + policies Storage (intégration).
- **Client** : `compresserImage` (unité), file d'attente/upload avec mocks du
  client Storage et d'`idb-keyval` (unité), pages « Devoirs » et capture (RTL).
- Vérification finale : lint, typecheck, tests unitaires, build, tests RLS.

## 7. Sécurité & confidentialité

- Données très sensibles (copies d'enfants) : bucket **privé**, accès scopé par
  chemin `parentId`, URLs signées à durée courte pour toute lecture.
- Le chemin d'upload est dérivé de l'`id` du parent authentifié (jamais d'un
  paramètre client arbitraire) ; les policies Storage le vérifient en second
  rempart.
- RLS `submissions` isole par parent avec vérification d'appartenance de
  l'enfant.

## 8. Hors périmètre (2a)

- Correction IA (Edge Function vision, note, feedback, affichage) → 2b.
- Background Sync automatique (reprise manuelle seulement).
- Suppression / gestion avancée des copies.
