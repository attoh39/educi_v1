# EduCI 1B-b — Génération de devoirs, mode secondaire : design

**Date :** 2026-07-12
**Statut :** validé (architecture & Edge, schéma & profils, client)
**Base :** le socle 1B-a (génération primaire) est fusionné dans `main`
(`c690d8b`). Ce document décrit l'extension au collège (6e–3e) et au lycée
(2de–Tle). Il maximise la réutilisation de l'existant.

---

## 1. Objectif

À partir de la 6e, plusieurs enseignants interviennent. Le parent ne colle plus
un message unique : il remplit **un champ par matière** (au fil des messages
reçus dans la journée). EduCI génère alors un **contrôle** structuré, adapté au
niveau et à chaque discipline, imprimable en PDF ; le corrigé est produit et
stocké mais jamais imprimé sur la feuille de l'élève.

**Critère de fin :** un parent d'un élève au secondaire renseigne une ou
plusieurs matières de l'inscription de l'enfant et obtient, en une génération
décomptée du quota hebdomadaire, un contrôle noté (barème /20) adapté au niveau
et aux disciplines renseignées, qu'il imprime en PDF ; un autre parent ne voit
jamais ces données (RLS) ; en cas d'échec, le quota n'est pas consommé ; le
devoir reste consultable hors ligne.

## 2. Décisions validées

| Sujet | Décision |
|---|---|
| Appel IA | **Un seul appel Claude** regroupant toutes les matières renseignées |
| Formulaire | **Matières de l'inscription** (`enrollment.matieres`), remplissage **partiel** ; seules les matières non vides sont envoyées |
| Profils | **Détaillés par matière × cycle** (collège, lycée) |
| Gabarit | **Contrôle noté** : barème par exercice + total /20 |
| Réutilisation | Edge Function, schéma de devoir, cache, quotas, tables/RLS **réutilisés**, étendus a minima |

## 3. Ce qui est réutilisé tel quel

- **Tables `homework_requests` / `homeworks` / `usage_quotas`**, RLS, RPC
  `incrementer_quota` : aucun changement de schéma SQL. `homework_requests.mode`
  vaut `'secondaire'` ; `contenu` stocke `{ matieres: [{ matiere, contenu }] }`.
  `homeworks.exercices` réutilise la forme `{ matieres: [...] }`.
- **Client Claude** (`_shared/claude.ts`), **cache IndexedDB**
  (`src/lib/devoirsCache.ts`), **domaine** (`classes.ts` : `modeGenerationOf`,
  `cycleOf`, `matieresParDefaut`), **semaine/quota** (`semaine.ts`).
- **Edge Function `generate-homework`** : même fonction, on ajoute une branche.

## 4. Changements

### 4.1 Schéma du devoir (partagé)

Ajout d'un champ **`points?: number` optionnel** (entier ≥ 0) par exercice, dans
les DEUX contrats qui doivent rester synchrones :

- `src/features/devoirs/schema.ts` (client, sans corrigé) ;
- `supabase/functions/_shared/devoir.ts` (Edge, avec corrigé) et son
  `DEVOIR_JSON_SCHEMA` (propriété `points` de type `integer`, **non** ajoutée à
  `required` — elle reste optionnelle).

Le champ étant optionnel, le mode primaire (qui ne l'émet pas) n'est pas affecté.
Le total /20 est **calculé à l'affichage** par somme des `points` présents ;
aucun champ « total » stocké.

### 4.2 Profils secondaires (`_shared/profils.ts`)

- `PROMPT_VERSION` du secondaire : `'secondaire-v1'` (constante distincte de
  `'primaire-v1'`).
- Un **préambule par cycle** (`college`, `lycee`) posant la présentation type
  « contrôle » (en-tête, matières en sections, consignes plus longues,
  attribution d'un barème par exercice totalisant 20 points par contrôle, corrigé
  détaillé).
- Des **règles par matière** (collège et lycée) pour : Français, Mathématiques,
  Anglais, SVT, Physique-Chimie, Histoire-Géographie, Philosophie, Informatique.
  (Une matière renseignée par le parent mais sans règle dédiée retombe sur le
  préambule de cycle seul — dégradation gracieuse.)
- Fonction `profilSecondaire(cycle: 'college' | 'lycee', matieres: string[]):
  { texte: string; cle: string } | null` qui concatène le préambule du cycle +
  les règles des seules matières présentes. Retourne `null` hors collège/lycée.
- La fonction primaire `profilPourCycle` reste inchangée.

### 4.3 Edge Function — branche par mode

Le handler lit déjà la classe de l'inscription. On dérive le **mode** via le
cycle (maternelle/cp_ce1/ce2_cm2 → primaire ; college/lycee → secondaire).

- **Primaire** (existant) : corps `{ childId, message }`, profil primaire,
  message = le texte collé.
- **Secondaire** (nouveau) : corps `{ childId, matieres: [{ matiere, contenu }] }`.
  Le handler : valide qu'au moins une matière a un `contenu` non vide (≥ 3
  caractères) ; ne conserve que les matières non vides **et présentes dans
  `enrollment.matieres`** (sécurité : on n'accepte pas une matière étrangère à
  l'inscription) ; assemble un message texte listant chaque matière et son
  contenu ; sélectionne `profilSecondaire(cycle, matieresPresentes)` ; un seul
  appel Claude ; validation zod ; persistance (`mode: 'secondaire'`,
  `contenu: { matieres }`, `profil: cle`, `prompt_version: 'secondaire-v1'`).

Le reste (quota vérifié puis incrémenté, trace `homework_requests`, gestion
d'échec sans consommer le quota, RLS) est **identique** au primaire. L'assemblage
du prompt et le choix du profil sont extraits par mode pour garder le handler
lisible.

### 4.4 Client

- **`api.ts`** : `genererDevoir` accepte une saisie **union** —
  `{ mode: 'primaire'; message: string }` ou
  `{ mode: 'secondaire'; matieres: { matiere: string; contenu: string }[] }` —
  et poste le corps correspondant à l'Edge Function. Type de retour inchangé
  (`DevoirGenere`). Le site d'appel primaire existant (et son test) est mis à
  jour pour passer `{ mode: 'primaire', message }` — changement mécanique, le
  comportement primaire reste identique.
- **`GenerateHomeworkPage`** : détecte le mode via `modeGenerationOf(classe)`
  (la classe vient déjà de l'état de navigation). Rend :
  - primaire → le formulaire textarea existant (inchangé) ;
  - secondaire → un **formulaire multi-matières** : un `<textarea>` par matière
    de l'inscription (transmise via l'état de navigation depuis la liste des
    enfants), remplissage partiel, bouton « Générer le contrôle » actif dès
    qu'au moins une matière est renseignée. Garde anti-double-soumission
    (`useRef`) comme le primaire.
  - Après génération : mise en cache + affichage `DevoirDocument`.
- **`DevoirDocument`** : accepte une prop `variante?: 'primaire' | 'secondaire'`
  (défaut `'primaire'`). En `'secondaire'` : titre « Contrôle », total /20 en
  en-tête (somme des `points`), et pour chaque exercice l'affichage de ses
  `points` (ex. « (3 pts) »). En `'primaire'` : rendu actuel inchangé.
- **`ChildrenPage`** : le lien de génération passe déjà la classe et le nom dans
  l'état ; il transmettra aussi `matieres` (de l'inscription) pour le formulaire
  secondaire. Le libellé du lien reste « Générer un devoir ».
- **i18n** (`fr.ts`, section `devoirs`) : ajout des textes du mode secondaire
  (titre contrôle, instruction « remplissez les matières reçues », bouton
  « Générer le contrôle », mention barème, libellé « points »).

## 5. Frontière de sécurité (rappel)

- Le **corrigé** n'est jamais renvoyé au client : le type `Devoir` côté client
  reste `{ matieres }` sans `corrige`. Le composant ne peut pas l'afficher.
- Le handler n'accepte que des **matières présentes dans l'inscription** de
  l'enfant (filtre serveur), en plus de la RLS qui garantit déjà l'appartenance
  de l'enfant au parent (`auth.uid()`).
- Quotas et validation d'entrée appliqués **côté serveur**.

## 6. Tests

- **Schéma** (TDD) : `points?` accepté, entier ≥ 0, optionnel (primaire encore
  valide).
- **Profils secondaires** (TDD Deno / unité) : `profilSecondaire` assemble le
  préambule du cycle + les règles des matières présentes ; retourne `null` hors
  secondaire ; matière sans règle dédiée ⇒ préambule seul.
- **Edge Function** (intégration Deno, faux serveur Claude) : un parent d'un
  élève de 6e envoie 2 matières ⇒ 200, devoir persisté en `mode: 'secondaire'`,
  quota incrémenté ; matière hors inscription ignorée ; aucune matière non vide
  ⇒ 400.
- **Formulaire secondaire** (RTL) : rend un champ par matière de l'inscription ;
  n'envoie que les matières remplies ; garde anti-double-envoi.
- **Rendu contrôle** (RTL) : affiche « Contrôle », le total /20 et les points par
  exercice ; le corrigé n'apparaît pas.
- **RLS** : inchangée (couverte par 1B-a). Vérification finale complète : lint,
  typecheck, tests unitaires, build, tests RLS.

## 7. Hors périmètre

- Correction automatique des copies (plan 2).
- Enseignants nommés par matière (déjà modélisables via `teachers`, non requis
  ici).
- Profils au-delà des 8 matières listées (dégradation gracieuse sur le préambule
  de cycle).
