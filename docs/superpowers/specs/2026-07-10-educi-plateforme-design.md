# EduCI — Spécification d'architecture de la plateforme

**Date :** 2026-07-10
**Statut :** validé par le porteur du projet (architecture, données/IA, phasage)
**Portée :** ce document fixe l'architecture d'ensemble et le contrat entre les briques.
Chaque phase de livraison fera l'objet de sa propre spécification détaillée et de son
propre plan d'implémentation.

---

## 1. Vision produit (rappel)

EduCI est une plateforme d'accompagnement scolaire par IA destinée aux parents en
Côte d'Ivoire. Le parent transmet le contenu des cours (message WhatsApp de
l'enseignant), l'application génère des devoirs PDF adaptés au niveau réel de
l'enfant, corrige les copies photographiées, et construit année après année un
dossier pédagogique qui personnalise l'accompagnement de la maternelle à la
terminale. Un Coach IA analyse les résultats et conseille le parent.

**Contraintes de lancement :**
- 5 000 utilisateurs au lancement, objectif 1 000 000 avant fin d'année.
- Usage majoritairement mobile (appareil photo, micro), réseaux parfois lents.
- Mise en production « le plus tôt possible » : livraison séquentielle par phases,
  chaque phase entièrement fonctionnelle et testée avant la suivante. Pas de MVP
  jetable : chaque brique livrée est du code de production.

## 2. Décisions structurantes (validées)

| Décision | Choix | Raison principale |
|---|---|---|
| Backend | **Supabase** (PostgreSQL, Auth, Storage, Edge Functions) | Scalable, relationnel (indispensable au dossier pédagogique), rapide à mettre en production |
| Moteur IA | **Claude API (Anthropic)** | Vision performante sur écriture manuscrite d'enfants, excellent français pédagogique, gamme de modèles pour optimiser les coûts |
| Paiement | **CinetPay** | Agrégateur ivoirien : Orange Money, MTN MoMo, Moov Money, Wave + cartes |
| Frontend | **React + Vite + TypeScript, SPA statique PWA** | CDN (Cloudflare Pages) : rapide sur réseau lent, offline robuste, coût d'hébergement quasi nul à grande échelle |
| Livraison | **Séquentielle en production** (approche A) | Retours utilisateurs immédiats, pas d'effet tunnel |
| Vocal | Architecture prête dès le départ, **livraison en phase 5** | Les trois usages vocaux sont dans la vision mais non bloquants pour le lancement |

## 3. Architecture technique

```
┌─────────────────────────────────────────────┐
│  PWA React + Vite + TypeScript (Tailwind)   │
│  CDN Cloudflare Pages — offline via Workbox │
│  Caméra (capture copies) · PDF côté client  │
└──────────────┬──────────────────────────────┘
               │ HTTPS (supabase-js)
┌──────────────▼──────────────────────────────┐
│  SUPABASE                                   │
│  · Auth (email/téléphone + OTP)             │
│  · PostgreSQL + RLS (isolation par parent)  │
│  · Storage (photos de copies, compressées)  │
│  · Edge Functions (Deno) :                  │
│     generate-homework  → Claude API         │
│     correct-submission → Claude API vision  │
│     coach-analysis     → Claude API         │
│     cinetpay-webhook   → activation plans   │
└─────────────────────────────────────────────┘
```

### 3.1 Frontend (PWA)

- **Stack :** React 18+, Vite, TypeScript strict, Tailwind CSS, `vite-plugin-pwa`
  (Workbox).
- **Responsive mobile-first** : conçu pour smartphones d'entrée/milieu de gamme ;
  fonctionne aussi sur tablette et desktop.
- **Offline-first :**
  - coquille applicative précachée (app shell) ;
  - devoirs générés et PDF stockés en IndexedDB, consultables hors ligne ;
  - photos de copies mises en file d'attente locale et téléversées au retour du
    réseau (Background Sync avec repli manuel).
- **Caméra :** capture via `<input capture>` / `getUserMedia`, compression et
  redimensionnement côté client avant upload (réseaux lents, coûts de stockage).
- **PDF côté client :** le devoir est un JSON structuré (schéma typé) rendu en PDF
  dans le navigateur. Gabarits de mise en page par niveau (maternelle, CP, CE, CM,
  collège, lycée) : taille de police, densité d'illustrations, espaces d'écriture.
  Illustrations issues d'une bibliothèque SVG embarquée classée par âge et par
  thème — pas d'images générées par IA (coût, fiabilité, latence).
- **Installabilité PWA :** manifest complet, invite d'installation, icônes, écran
  de démarrage ; l'application doit être utilisable installée comme dans le
  navigateur.

### 3.2 Backend (Supabase)

- **Auth :** compte parent par e-mail ou numéro de téléphone + OTP. Le téléphone
  est le mode privilégié en Côte d'Ivoire.
- **PostgreSQL avec RLS systématique :** un parent ne voit que ses propres données ;
  aucune table applicative sans politique RLS.
- **Storage :** bucket privé pour les photos de copies, chemin par
  `parent/enfant/devoir`, accès signé.
- **Edge Functions :** toute la logique sensible (appels Claude, quotas, webhooks
  CinetPay) vit côté serveur. **La clé Claude et les secrets CinetPay ne quittent
  jamais le serveur.** Chaque fonction vérifie : identité (JWT Supabase),
  abonnement actif ou période de lancement, quota restant.

### 3.3 Couche IA

- **Bibliothèque de profils pédagogiques** versionnée dans le code : un profil par
  cycle (maternelle, CP1–CE1, CE2–CM2, collège, lycée) décliné par matière au
  secondaire. Chaque profil définit le ton, la structure des exercices, la
  progressivité, le format de sortie.
- **Routage de modèles pour maîtriser les coûts** (principal coût variable à 1M
  d'utilisateurs) :
  - interprétation du message WhatsApp collé → modèle rapide/économique (Haiku) ;
  - génération de devoirs et correction de copies → modèle équilibré (Sonnet) ;
  - **prompt caching** sur les profils pédagogiques (blocs stables réutilisés).
- **Sorties structurées :** toute réponse IA est un JSON validé par schéma (zod)
  avant persistance ; en cas d'échec de validation, nouvelle tentative encadrée
  puis erreur propre à l'utilisateur. Jamais de contenu IA non validé en base.
- **Personnalisation :** chaque génération injecte un résumé du dossier
  pédagogique de l'enfant (compétences maîtrisées, difficultés récurrentes,
  dernier niveau atteint). Deux enfants de la même classe reçoivent des exercices
  différents.

## 4. Modèle de données

Toutes les tables sont protégées par RLS (clé d'isolation : `parent_id`).

| Table | Rôle |
|---|---|
| `parents` | compte, préférences, référence à l'abonnement courant |
| `children` | **profil permanent** : identité, date de naissance, sexe, photo — ne disparaît jamais, accompagne l'élève de la maternelle à la terminale |
| `enrollments` | une ligne par enfant et par année scolaire : classe, établissement, système éducatif, matières ; c'est ici que « seules quelques informations changent » chaque année |
| `teachers` | enseignants par matière (secondaire), liés à un enrollment |
| `homework_requests` | saisie du parent : message WhatsApp collé (primaire) ou champs par matière (secondaire), statut de génération |
| `homeworks` | devoir généré : JSON structuré des exercices, profil pédagogique et version de prompt utilisés, modèle IA, coût |
| `submissions` | photos de copies (références Storage), statut de correction |
| `corrections` | note, erreurs expliquées, bonnes réponses, commentaire global |
| `skill_records` | **dossier pédagogique** : compétence × matière × niveau de maîtrise × historique d'évolution ; alimenté automatiquement par chaque correction |
| `coach_reports` | analyses périodiques et recommandations du Coach IA |
| `plans` | formules Découverte / Famille / Premium : prix, quotas, fonctionnalités |
| `subscriptions` | abonnement d'un parent : plan, statut (essai, actif, expiré), échéances |
| `payments` | transactions CinetPay : référence, statut, webhook reçu |
| `usage_quotas` | compteurs de générations/corrections par parent et par période |

**Règle de conception :** le mode de génération (primaire = message unique,
secondaire = un champ par matière) est déterminé automatiquement par la classe de
l'enrollment actif — le parent ne choisit jamais un « mode ».

## 5. Flux principaux

### 5.1 Génération d'un devoir
1. Le parent colle le message WhatsApp (primaire) ou remplit les matières au fil
   des messages reçus (secondaire), puis clique « Générer ».
2. Edge Function `generate-homework` : vérifie JWT + quota → sélectionne le profil
   pédagogique selon l'enrollment actif → injecte le résumé du dossier
   pédagogique → appelle Claude → valide le JSON → persiste `homeworks`,
   décrémente le quota.
3. Le client rend le PDF (gabarit du niveau), le stocke en IndexedDB, propose
   l'impression/le partage.

### 5.2 Correction d'une copie
1. Le parent photographie les feuilles (une ou plusieurs pages), compression
   locale, upload Storage (file d'attente si hors ligne).
2. Edge Function `correct-submission` : Claude vision reçoit **l'énoncé original,
   le barème et les photos** → correction structurée (note, erreurs, explications,
   bonnes réponses) → persiste `corrections` → met à jour `skill_records`
   (transaction).
3. Le parent consulte la correction ; l'enfant n'a jamais besoin de l'écran.

### 5.3 Coach IA
1. Déclenché après correction significative ou à la demande depuis le tableau
   de bord.
2. Edge Function `coach-analysis` : lit `skill_records` + historique récent →
   produit un rapport en langage simple (constats, recommandations, plan de la
   semaine) → persiste `coach_reports`.

### 5.4 Abonnement
1. À l'inscription pendant la **période de lancement** : accès gratuit avec quotas
   (pas de compte à rebours d'essai tant que le paiement n'est pas en production).
2. Une fois la phase 4 livrée : essai gratuit 7 jours pour les nouveaux inscrits,
   puis choix d'une formule ; checkout CinetPay ; `cinetpay-webhook` (signature
   vérifiée, idempotent) active l'abonnement.
3. Les quotas par plan sont appliqués côté Edge Functions, jamais côté client.

## 6. Sécurité

- RLS sur toutes les tables ; tests automatisés des politiques (un parent A ne
  peut pas lire les données d'un parent B).
- Secrets (Claude, CinetPay) uniquement en variables d'environnement des Edge
  Functions.
- Webhook CinetPay : vérification de signature + idempotence par référence de
  transaction.
- Quotas et limitation de débit sur toutes les fonctions IA (anti-abus : c'est de
  l'argent réel à chaque appel).
- Données d'enfants = données sensibles : minimisation (photo de profil
  facultative), bucket privé, URLs signées à durée courte, suppression de compte
  effective (cascade).
- Validation zod de toutes les entrées utilisateur côté Edge Functions.

## 7. Scalabilité et coûts

- **Frontend :** statique sur CDN — coût marginal nul de 5 000 à 1 000 000
  d'utilisateurs.
- **Supabase :** montée par paliers (Pro → dédié) sans changement d'architecture ;
  index sur les chemins de lecture chauds (dossier pédagogique, tableau de bord).
- **IA = principal coût variable.** Leviers intégrés dès la conception : routage
  Haiku/Sonnet, prompt caching, quotas par plan, PDF et rendus côté client,
  pas de génération d'images.
- **Observabilité :** journalisation structurée des Edge Functions (latence, coût
  IA par appel, taux d'échec de validation), Sentry côté client, tableau de bord
  interne des coûts IA par jour. Alerte si coût/jour dépasse un seuil.

## 8. Tests et qualité

- **TDD** sur la logique métier (quotas, sélection de profils, validation des
  schémas, mise à jour du dossier pédagogique).
- Tests d'intégration des Edge Functions (Supabase local + mocks Claude).
- Tests des politiques RLS.
- Tests E2E des parcours critiques (inscription → profil enfant → génération →
  PDF) sur viewport mobile.
- CI : lint, typecheck, tests, build à chaque commit.

## 9. Phasage de livraison

| Phase | Contenu | Critère de mise en production |
|---|---|---|
| **1** | PWA complète : auth (téléphone/e-mail), profils enfants persistants, enrollments, génération de devoirs (modes primaire et secondaire), rendu PDF par niveau, quotas de lancement, offline app-shell | Un parent réel crée son compte, ajoute un enfant, colle un message WhatsApp et imprime un devoir adapté au niveau |
| **2** | Correction : capture caméra, upload offline, Claude vision, notation et explications, alimentation automatique du dossier pédagogique | Une copie manuscrite réelle photographiée est corrigée avec une note et des explications justes |
| **3** | Coach IA + tableau de bord : graphiques d'évolution, forces/faiblesses, recommandations, objectifs de la semaine | Le Coach produit des recommandations exploitables à partir d'un historique réel |
| **4** | Monétisation : plans Découverte/Famille/Premium, essai 7 jours, checkout CinetPay, webhooks, gestion des quotas par plan | Un paiement Orange Money réel active un abonnement de bout en bout |
| **5** | Vocal : dictée du parent (transcription du cours), lecture à voix haute de l'enfant (évaluation de fluidité), questions vocales au Coach | Chaque usage vocal fonctionne sur un téléphone Android d'entrée de gamme |

Chaque phase : spec détaillée → plan d'implémentation → TDD → revue de code →
vérification de bout en bout → production.

## 10. Hors périmètre (explicitement)

- Application native iOS/Android (la PWA couvre le besoin ; à réévaluer plus tard).
- Interface pour les enseignants (ils restent sur WhatsApp — c'est un principe
  produit, pas un manque).
- Images générées par IA dans les PDF.
- Multilingue : le lancement est en français uniquement.
