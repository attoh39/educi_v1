# EduCI — Spécification : génération de devoirs (plan 1B)

**Date :** 2026-07-11
**Statut :** validé par le porteur du projet (6 sections approuvées)
**Dépend de :** socle 1A livré (Supabase + Auth + RLS, profils enfants `children`
+ inscriptions `enrollments`, domaine `src/domain/classes.ts`, PWA React).
**Portée :** ce document fixe la génération de devoirs. La correction des copies,
le Coach IA, le paiement et le vocal font l'objet de plans ultérieurs.

---

## 1. Objectif

Le parent saisit le contenu du cours transmis par l'enseignant ; EduCI génère un
devoir structuré adapté au niveau réel de l'enfant, rendu en PDF imprimable. Au
primaire, un seul message WhatsApp regroupe plusieurs matières ; au secondaire, le
parent remplit un champ par matière. Le mode est déterminé automatiquement par la
classe de l'inscription active — le parent ne choisit jamais un « mode ».

## 2. Décisions structurantes (validées)

| Décision | Choix | Raison |
|---|---|---|
| Modèle IA | **Claude Sonnet 5** pour l'interprétation ET la génération | Qualité pédagogique fiable au lancement ; prompt caching sur les profils ; optimisation Haiku différée après mesure |
| Rendu PDF | **HTML/CSS → impression navigateur** (`@media print`) | Zéro dépendance lourde, fidèle à l'écran, léger sur mobile, adapté à l'impression papier |
| Corrigé | **Généré et stocké**, non imprimé sur la feuille de l'enfant | Un seul appel IA ; prépare la correction automatique (plan 2) |
| Quota | **Hebdomadaire par enfant**, appliqué côté Edge Function | Reflète le rythme scolaire, plafonne le coût IA, se mappe sur les futurs plans |
| Profils pédagogiques | **5 profils par cycle**, versionnés dans le code | Simples, testables, prompt-cachés ; règles par matière ajoutées au secondaire |
| Échecs IA | **Machine à états + reprise sans re-débit du quota** | Résistant aux réseaux lents/coupés ivoiriens |
| Orchestration | **Edge Function synchrone** (pas de file asynchrone) | Suffisant au lancement ; file différée si le volume l'exige |

## 3. Architecture et flux

```
┌─────────────────────────────────────────────┐
│  PWA React (socle 1A)                        │
│  · Saisie du cours (message unique OU        │
│    un champ par matière selon la classe)     │
│  · Rendu HTML/CSS du devoir → impression PDF │
│  · Cache IndexedDB (consultation hors ligne) │
└──────────────┬──────────────────────────────┘
               │ supabase.functions.invoke('generate-homework')
┌──────────────▼──────────────────────────────┐
│  Edge Function generate-homework (Deno)      │
│  1. vérifie JWT (auth.uid())                 │
│  2. vérifie + réserve le quota hebdo/enfant  │
│  3. charge le profil pédagogique du cycle    │
│  4. (secondaire) ajoute les règles/matière   │
│  5. appelle Claude Sonnet 5 (prompt cache)   │
│  6. valide le JSON de sortie (zod, 1 retry)  │
│  7. persiste homeworks, confirme le quota    │
│     ou marque 'echec' sans débiter           │
└──────────────┬───────────────────────────────┘
               │ ANTHROPIC_API_KEY (secret serveur only)
        ┌──────▼──────┐
        │  Claude API │
        └─────────────┘
```

Le mode de génération vient de `modeGenerationOf(classe)` (livré en 1A) :
`primaire` (maternelle→CM2) = un message unique ; `secondaire` (6e→terminale) =
une entrée par matière.

## 4. Modèle de données (nouvelles tables)

Toutes sous RLS, clé d'isolation `parent_id = auth.uid()`, GRANTs `authenticated`
(même pattern que le socle 1A).

| Table | Rôle |
|---|---|
| `homework_requests` | saisie du parent : `child_id`, `enrollment_id`, `mode` (`primaire`/`secondaire`), `contenu` (jsonb : `{ message }` en primaire, `{ matieres: { <nom>: <texte> } }` en secondaire), `statut` (`en_attente`/`generation`/`pret`/`echec`), `erreur` (texte nullable), horodatages |
| `homeworks` | devoir généré : `request_id`, `child_id`, `enrollment_id`, `exercices` (jsonb), `corrige` (jsonb, non exposé à l'impression enfant), `profil` (cycle), `prompt_version`, `modele` (`claude-sonnet-5`), `cout_tokens_entree`/`cout_tokens_sortie`, `created_at` |
| `usage_quotas` | compteur : `child_id`, `semaine_iso` (ex. `2026-W37`), `generations`, unique `(child_id, semaine_iso)` |

Le quota par défaut de lancement est une constante serveur (ex.
`GENERATIONS_PAR_SEMAINE = 10` par enfant), non stockée par enfant pour l'instant ;
la table `usage_quotas` ne compte que la consommation.

## 5. Profils pédagogiques et schéma du devoir

### 5.1 Profils (versionnés côté Edge Function)
Cinq profils, un par cycle, chacun décrivant en langage naturel : le ton, la
structure attendue des exercices, la progressivité, la densité d'illustrations, la
longueur des consignes, et le format de sortie exigé.

- **maternelle** : images, couleurs, observation, coloriage, motricité ; consignes
  très courtes lues par le parent.
- **cp_ce1** : très grosses lettres, beaucoup d'illustrations, syllabes, mots
  simples, exercices très progressifs.
- **ce2_cm2** : complexité croissante, moins d'illustrations, consignes plus
  longues.
- **college** : présentation type contrôle scolaire ; au secondaire, des règles
  par matière (français, maths, anglais, SVT, physique-chimie, histoire-géo…) se
  greffent sur le profil de cycle.
- **lycee** : exercices analytiques, corrigés détaillés, préparation aux examens.

### 5.2 Schéma du devoir (zod, versionné `prompt_version`)
Toute sortie IA est validée avant persistance :
```
Devoir = {
  matieres: [{
    nom: string,
    exercices: [{
      numero: number,
      consigne: string,
      type: 'ecriture' | 'qcm' | 'appariement' | 'calcul' | 'coloriage' | 'libre',
      items?: string[],                 // ex. questions QCM, opérations
      espaceReponse: 'lignes' | 'cadre' | 'aucun',
      illustration?: string             // clé d'un SVG embarqué, jamais une URL
    }]
  }],
  corrige: [{ matiere: string, numero: number, reponse: string, explication: string }]
}
```
Les illustrations référencent une **bibliothèque SVG embarquée** classée par âge
et thème — pas d'image générée par IA (coût, latence, fiabilité).

## 6. Rendu PDF (HTML/CSS → impression)

- Composant `DevoirDocument` : rend le JSON `exercices` en HTML mis en page par
  **gabarit de cycle** (grosses lettres + illustrations au primaire ; présentation
  « contrôle » au secondaire), avec en-tête (nom de l'enfant, classe, date,
  matières) et espaces d'écriture conformes aux habitudes scolaires.
- Feuille `@media print` : format A4 propre, sauts de page par matière, masquage
  de la navigation. Bouton « Imprimer / Enregistrer en PDF » (impression
  navigateur native).
- Le **corrigé n'est jamais rendu** sur la feuille de l'enfant ; il reste en base
  pour le futur module de correction. Une vue séparée (optionnelle) permettra au
  parent de le consulter/imprimer à part.
- Le devoir généré est mis en cache **IndexedDB** → consultable et imprimable hors
  ligne (réseaux lents).

## 7. Quotas et gestion des erreurs

- **Quota hebdomadaire par enfant** (semaine ISO) : l'Edge Function **vérifie**
  `generations < GENERATIONS_PAR_SEMAINE` avant l'appel Claude, puis **incrémente
  le compteur uniquement après** la persistance réussie du devoir (upsert
  atomique sur `usage_quotas`). En cas d'échec, le compteur n'est pas incrémenté —
  le parent peut relancer sans perte. (Une double génération concurrente pour le
  même enfant reste théoriquement possible à la seconde près ; acceptable au
  lancement, à durcir par verrou si le volume l'exige.)
- **Machine à états** sur `homework_requests` :
  `en_attente → generation → pret` (succès) ou `→ echec` (JSON invalide après un
  retry, timeout, erreur réseau). En `echec`, message clair et bouton « Relancer »
  qui **ne re-débite pas** le quota d'une génération déjà comptée.
- Idempotence : une même `homework_request` ne peut produire qu'un `homeworks`
  (contrainte d'unicité sur `request_id`).

## 8. Sécurité

- `ANTHROPIC_API_KEY` uniquement en variable d'environnement de l'Edge Function ;
  jamais exposée au client.
- Validation zod de **toute entrée parent** (longueur du message, nombre/longueur
  des champs matière) et de **toute sortie IA** avant persistance.
- RLS sur les trois nouvelles tables (isolation par parent), GRANTs `authenticated`
  comme le socle. Tests d'isolation ajoutés à la suite RLS existante.
- Rate-limiting/quota comme garde-fou anti-abus (coût réel par appel).
- Le contenu collé par le parent est **des données**, jamais des instructions : le
  prompt système isole strictement le profil pédagogique du contenu utilisateur
  (défense prompt-injection).

## 9. Tests

- **Unitaires** : sélection de profil par cycle, schéma zod du devoir (valide /
  invalide), construction du prompt, logique de quota (semaine ISO, réservation/
  confirmation/annulation).
- **Intégration Edge Function** : Supabase local + Claude mocké — chemins succès,
  JSON invalide puis retry, échec définitif sans débit, quota épuisé.
- **RLS** : un parent B ne voit ni les demandes ni les devoirs du parent A.
- **E2E (viewport mobile)** : saisie du cours → génération → rendu → impression
  PDF ; consultation hors ligne depuis IndexedDB.

## 10. Découpage de livraison

| Sous-plan | Contenu | Critère de mise en production |
|---|---|---|
| **1B-a** | Mode **primaire** : saisie du message unique, Edge Function `generate-homework`, profils maternelle/CP-CE1/CE2-CM2, schéma + validation, quotas hebdo, rendu HTML/CSS + impression, cache IndexedDB, tests | Un parent au primaire colle un message WhatsApp réel et imprime un devoir adapté au niveau, avec quota décompté |
| **1B-b** | Mode **secondaire** : formulaire un champ par matière, profils collège/lycée + règles par matière, gabarit « contrôle » | Un parent au collège renseigne plusieurs matières et imprime un dossier complet |

Chaque sous-plan : spec courte (si nécessaire) → plan d'implémentation → TDD →
revues (conformité + qualité) → vérification E2E → production.

## 11. Hors périmètre (explicite)

- Correction des copies photographiées (plan 2) — mais le corrigé est déjà stocké.
- Coach IA, tableau de bord, dossier pédagogique (plan 3) — le résumé du dossier
  injecté à la génération est vide en 1B.
- Paiement / plans (plan 4) ; le quota de lancement est une constante serveur.
- Dictée vocale du cours (plan 5).
- Images générées par IA ; multilingue.
