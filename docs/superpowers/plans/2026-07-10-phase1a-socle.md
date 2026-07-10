# EduCI Phase 1A — Socle PWA + Supabase : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le socle production d'EduCI : PWA React installable et offline-ready, authentification Supabase (e-mail/téléphone + OTP), profils enfants permanents avec inscriptions annuelles (enrollments), le tout sous RLS testée, avec CI et déploiement Cloudflare Pages.

**Architecture:** SPA statique React + Vite + TypeScript strict servie par CDN ; toutes les données dans Supabase (PostgreSQL + RLS, isolation par `parent_id = auth.uid()`) ; création atomique enfant+inscription via RPC PostgreSQL ; la logique de domaine (classes, cycles, mode de génération) vit dans `src/domain/` pure et testée unitairement.

**Tech Stack:** React 18, Vite, TypeScript strict, Tailwind CSS v4, vite-plugin-pwa (Workbox), supabase-js, react-router-dom, react-hook-form + zod, Vitest + React Testing Library, Supabase CLI (Docker requis pour le local), GitHub Actions, Cloudflare Pages.

**Prérequis poste de dev :** Node.js ≥ 20, Docker Desktop démarré, Supabase CLI installé (`npm i -g supabase` ou scoop/brew).

**Reporté au plan 1B (explicitement hors de ce plan) :** génération de devoirs, Edge Functions, quotas, PDF, upload de la photo de l'enfant (nécessite le bucket Storage configuré en 1B), enseignants par matière (table `teachers`).

---

## Structure de fichiers cible

```
Educi.v.1.1/
├── .github/workflows/ci.yml
├── public/
│   ├── _redirects                    # SPA fallback Cloudflare Pages
│   └── icons/                        # générées par scripts/generate-icons.mjs
├── scripts/generate-icons.mjs
├── src/
│   ├── main.tsx                      # bootstrap React + router + AuthProvider
│   ├── index.css                     # Tailwind
│   ├── routes.tsx                    # définition des routes
│   ├── lib/
│   │   ├── supabase.ts               # client unique
│   │   └── database.types.ts         # généré par supabase gen types
│   ├── i18n/fr.ts                    # tous les textes UI (français)
│   ├── domain/
│   │   ├── classes.ts                # classes CI, cycles, mode génération, année scolaire
│   │   └── classes.test.ts
│   ├── components/
│   │   ├── AppShell.tsx              # header + bottom nav mobile-first
│   │   └── Chargement.tsx
│   ├── features/
│   │   ├── auth/
│   │   │   ├── AuthProvider.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   └── LoginPage.test.tsx
│   │   ├── children/
│   │   │   ├── api.ts
│   │   │   ├── api.test.ts
│   │   │   ├── schema.ts             # zod du formulaire enfant
│   │   │   ├── schema.test.ts
│   │   │   ├── ChildrenPage.tsx
│   │   │   ├── NewChildPage.tsx
│   │   │   └── NewChildPage.test.tsx
│   │   ├── home/HomePage.tsx
│   │   └── account/AccountPage.tsx
│   └── test/setup.ts
├── supabase/
│   ├── config.toml                   # créé par supabase init, édité
│   ├── migrations/20260710120000_socle.sql
│   └── tests/rls.test.ts             # tests d'isolation RLS (intégration)
├── vitest.rls.config.ts
├── vite.config.ts
├── .env.example
└── README.md
```

---

### Task 1 : Scaffold du projet Vite React TypeScript

**Files:**
- Create: projet Vite à la racine (`package.json`, `tsconfig*.json`, `index.html`, `src/`)

- [ ] **Step 1 : Scaffolder le projet**

Run (à la racine `C:\Users\User\Educi.v.1.1`, le dossier contient déjà `docs/` et `.git/` — le template s'installe par-dessus) :
```bash
npm create vite@latest . -- --template react-ts
npm install
```
Si le CLI demande quoi faire du dossier non vide : choisir « Ignore files and continue ».

- [ ] **Step 2 : Vérifier que le build fonctionne**

Run: `npm run build`
Expected: build Vite réussi, dossier `dist/` créé.

- [ ] **Step 3 : Nettoyer le template**

Supprimer `src/App.css`, `src/assets/react.svg`, `public/vite.svg`. Remplacer `src/App.tsx` par :
```tsx
export default function App() {
  return <p>EduCI</p>;
}
```
Dans `index.html`, remplacer le `<title>` et ajouter la langue :
```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0d9488" />
    <title>EduCI — L'IA au service de la réussite scolaire</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
Dans `src/main.tsx`, retirer l'import de `App.css` s'il y est (garder `index.css`).

- [ ] **Step 4 : Vérifier build + lint**

Run: `npm run build && npm run lint`
Expected: succès sans erreur.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TypeScript"
```

---

### Task 2 : Outillage — Tailwind v4, Vitest + RTL, dépendances

**Files:**
- Modify: `vite.config.ts`, `src/index.css`, `package.json`
- Create: `src/test/setup.ts`

- [ ] **Step 1 : Installer les dépendances**

```bash
npm install tailwindcss @tailwindcss/vite react-router-dom @supabase/supabase-js react-hook-form zod @hookform/resolvers
npm install -D vite-plugin-pwa vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event sharp dotenv
```

- [ ] **Step 2 : Configurer Vite + Vitest**

Remplacer `vite.config.ts` :
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'EduCI',
        short_name: 'EduCI',
        description: "L'intelligence artificielle au service de la réussite scolaire.",
        lang: 'fr',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#0d9488',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

Remplacer intégralement `src/index.css` :
```css
@import 'tailwindcss';
```

Créer `src/test/setup.ts` :
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3 : Ajouter les scripts npm**

Dans `package.json`, section `scripts` :
```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "typecheck": "tsc -b --noEmit",
  "test": "vitest",
  "test:run": "vitest --run",
  "test:rls": "vitest --run --config vitest.rls.config.ts",
  "preview": "vite preview"
}
```

- [ ] **Step 4 : Test sanité de l'outillage**

Créer temporairement `src/App.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

it('affiche EduCI', () => {
  render(<App />);
  expect(screen.getByText('EduCI')).toBeInTheDocument();
});
```
Run: `npm run test:run`
Expected: 1 test PASS.

- [ ] **Step 5 : Vérifier build complet**

Run: `npm run build && npm run typecheck`
Expected: succès. Le build affiche la génération du service worker (`sw.js`) par vite-plugin-pwa.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "chore: outillage Tailwind v4, PWA, Vitest, dépendances socle"
```

---

### Task 3 : Domaine — classes ivoiriennes, cycles, mode de génération (TDD)

**Files:**
- Create: `src/domain/classes.ts`
- Test: `src/domain/classes.test.ts`

- [ ] **Step 1 : Écrire les tests (échec attendu)**

Créer `src/domain/classes.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  anneeScolaire,
  classeLabel,
  cycleOf,
  matieresParDefaut,
  modeGenerationOf,
} from './classes';

describe('CLASSES', () => {
  it('couvre la maternelle à la terminale (16 classes)', () => {
    expect(CLASSES).toHaveLength(16);
    expect(CLASSES[0]).toBe('PS');
    expect(CLASSES[15]).toBe('TERMINALE');
  });
});

describe('cycleOf', () => {
  it('classe la maternelle', () => {
    expect(cycleOf('PS')).toBe('maternelle');
    expect(cycleOf('GS')).toBe('maternelle');
  });
  it('classe CP1–CE1', () => {
    expect(cycleOf('CP1')).toBe('cp_ce1');
    expect(cycleOf('CE1')).toBe('cp_ce1');
  });
  it('classe CE2–CM2', () => {
    expect(cycleOf('CE2')).toBe('ce2_cm2');
    expect(cycleOf('CM2')).toBe('ce2_cm2');
  });
  it('classe le collège', () => {
    expect(cycleOf('6EME')).toBe('college');
    expect(cycleOf('3EME')).toBe('college');
  });
  it('classe le lycée', () => {
    expect(cycleOf('SECONDE')).toBe('lycee');
    expect(cycleOf('TERMINALE')).toBe('lycee');
  });
});

describe('modeGenerationOf', () => {
  it('primaire de la maternelle au CM2', () => {
    expect(modeGenerationOf('PS')).toBe('primaire');
    expect(modeGenerationOf('CM2')).toBe('primaire');
  });
  it('secondaire à partir de la 6ème', () => {
    expect(modeGenerationOf('6EME')).toBe('secondaire');
    expect(modeGenerationOf('TERMINALE')).toBe('secondaire');
  });
});

describe('classeLabel', () => {
  it('donne des libellés français lisibles', () => {
    expect(classeLabel('PS')).toBe('Petite Section');
    expect(classeLabel('CP1')).toBe('CP1');
    expect(classeLabel('6EME')).toBe('6ème');
    expect(classeLabel('TERMINALE')).toBe('Terminale');
  });
});

describe('matieresParDefaut', () => {
  it('propose des matières adaptées au cycle', () => {
    expect(matieresParDefaut('CP1')).toContain('Français');
    expect(matieresParDefaut('CP1')).toContain('Mathématiques');
    expect(matieresParDefaut('TERMINALE')).toContain('Philosophie');
    expect(matieresParDefaut('PS')).toContain('Éveil');
  });
});

describe('anneeScolaire', () => {
  it("bascule sur l'année suivante à partir d'août", () => {
    expect(anneeScolaire(new Date('2026-08-15'))).toBe('2026-2027');
    expect(anneeScolaire(new Date('2027-02-10'))).toBe('2026-2027');
    expect(anneeScolaire(new Date('2027-07-31'))).toBe('2026-2027');
    expect(anneeScolaire(new Date('2027-08-01'))).toBe('2027-2028');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/domain`
Expected: FAIL — module `./classes` introuvable.

- [ ] **Step 3 : Implémenter le domaine**

Créer `src/domain/classes.ts` :
```ts
export const CLASSES = [
  'PS', 'MS', 'GS',
  'CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2',
  '6EME', '5EME', '4EME', '3EME',
  'SECONDE', 'PREMIERE', 'TERMINALE',
] as const;

export type Classe = (typeof CLASSES)[number];
export type Cycle = 'maternelle' | 'cp_ce1' | 'ce2_cm2' | 'college' | 'lycee';
export type ModeGeneration = 'primaire' | 'secondaire';
export type Systeme = 'IVOIRIEN' | 'FRANCAIS' | 'AUTRE';

const CYCLES: Record<Classe, Cycle> = {
  PS: 'maternelle', MS: 'maternelle', GS: 'maternelle',
  CP1: 'cp_ce1', CP2: 'cp_ce1', CE1: 'cp_ce1',
  CE2: 'ce2_cm2', CM1: 'ce2_cm2', CM2: 'ce2_cm2',
  '6EME': 'college', '5EME': 'college', '4EME': 'college', '3EME': 'college',
  SECONDE: 'lycee', PREMIERE: 'lycee', TERMINALE: 'lycee',
};

export function cycleOf(classe: Classe): Cycle {
  return CYCLES[classe];
}

export function modeGenerationOf(classe: Classe): ModeGeneration {
  const cycle = cycleOf(classe);
  return cycle === 'college' || cycle === 'lycee' ? 'secondaire' : 'primaire';
}

const LABELS: Record<Classe, string> = {
  PS: 'Petite Section', MS: 'Moyenne Section', GS: 'Grande Section',
  CP1: 'CP1', CP2: 'CP2', CE1: 'CE1', CE2: 'CE2', CM1: 'CM1', CM2: 'CM2',
  '6EME': '6ème', '5EME': '5ème', '4EME': '4ème', '3EME': '3ème',
  SECONDE: 'Seconde', PREMIERE: 'Première', TERMINALE: 'Terminale',
};

export function classeLabel(classe: Classe): string {
  return LABELS[classe];
}

const MATIERES: Record<Cycle, string[]> = {
  maternelle: ['Éveil', 'Langage', 'Graphisme', 'Motricité'],
  cp_ce1: ['Français', 'Mathématiques', 'EDHC', 'Éveil au milieu'],
  ce2_cm2: ['Français', 'Mathématiques', 'Histoire-Géographie', 'Sciences', 'EDHC'],
  college: [
    'Français', 'Mathématiques', 'Anglais', 'SVT', 'Physique-Chimie',
    'Histoire-Géographie', 'EDHC',
  ],
  lycee: [
    'Français', 'Mathématiques', 'Anglais', 'SVT', 'Physique-Chimie',
    'Histoire-Géographie', 'Philosophie', 'Informatique',
  ],
};

export function matieresParDefaut(classe: Classe): string[] {
  return MATIERES[cycleOf(classe)];
}

/** Année scolaire ivoirienne : bascule au 1er août. */
export function anneeScolaire(date: Date): string {
  const y = date.getFullYear();
  return date.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
```

- [ ] **Step 4 : Vérifier le passage**

Run: `npm run test:run -- src/domain`
Expected: tous les tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/domain
git commit -m "feat: domaine des classes ivoiriennes (cycles, mode de génération, année scolaire)"
```

---

### Task 4 : Textes UI français centralisés

**Files:**
- Create: `src/i18n/fr.ts`

- [ ] **Step 1 : Créer le module de textes**

Créer `src/i18n/fr.ts` (tout texte affiché à l'utilisateur vient d'ici — règle valable pour tout le projet) :
```ts
export const fr = {
  app: {
    nom: 'EduCI',
    slogan: "L'intelligence artificielle au service de la réussite scolaire.",
  },
  nav: { accueil: 'Accueil', enfants: 'Enfants', compte: 'Compte' },
  commun: {
    chargement: 'Chargement…',
    enregistrer: 'Enregistrer',
    annuler: 'Annuler',
    reessayer: 'Réessayer',
    erreurInconnue: 'Une erreur est survenue. Veuillez réessayer.',
  },
  auth: {
    titre: 'Connexion à EduCI',
    sousTitre: 'Recevez un code de vérification pour vous connecter.',
    onglets: { telephone: 'Téléphone', email: 'E-mail' },
    champTelephone: 'Numéro de téléphone',
    exempleTelephone: '+225 07 00 00 00 01',
    champEmail: 'Adresse e-mail',
    envoyerCode: 'Recevoir le code',
    envoiEnCours: 'Envoi…',
    champCode: 'Code reçu',
    verifierCode: 'Se connecter',
    verificationEnCours: 'Vérification…',
    changerIdentifiant: 'Modifier le numéro / e-mail',
    erreurEnvoi: "Impossible d'envoyer le code. Vérifiez votre saisie puis réessayez.",
    codeInvalide: 'Code invalide ou expiré. Réessayez.',
    deconnexion: 'Se déconnecter',
  },
  enfants: {
    titre: 'Mes enfants',
    aucun: "Aucun enfant pour l'instant.",
    ajouter: 'Ajouter un enfant',
    nom: 'Nom',
    prenoms: 'Prénoms',
    dateNaissance: 'Date de naissance',
    sexe: 'Sexe',
    garcon: 'Garçon',
    fille: 'Fille',
    classe: 'Classe',
    etablissement: 'Établissement scolaire',
    systeme: 'Système éducatif',
    systemes: { IVOIRIEN: 'Ivoirien', FRANCAIS: 'Français', AUTRE: 'Autre' },
    matieres: 'Matières étudiées',
    creationReussie: 'Profil créé. Il accompagnera votre enfant toute sa scolarité.',
  },
  accueil: {
    bienvenue: 'Bienvenue sur EduCI',
    intro: "Ajoutez vos enfants puis générez des devoirs adaptés à leur niveau.",
  },
  compte: { titre: 'Mon compte', identifiant: 'Identifiant' },
  validation: {
    requis: 'Ce champ est obligatoire.',
    dateFuture: 'La date de naissance ne peut pas être dans le futur.',
    matiereMin: 'Sélectionnez au moins une matière.',
  },
} as const;
```

- [ ] **Step 2 : Vérifier le typecheck et committer**

Run: `npm run typecheck`
Expected: succès.

```bash
git add src/i18n
git commit -m "feat: textes UI français centralisés"
```

---

### Task 5 : Icônes PWA et fallback SPA

**Files:**
- Create: `scripts/generate-icons.mjs`, `public/_redirects`, `public/icons/*.png`

- [ ] **Step 1 : Script de génération d'icônes**

Créer `scripts/generate-icons.mjs` :
```js
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const logo = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="#0d9488"/>
  <text x="256" y="${pad ? 320 : 330}" font-family="Arial, sans-serif"
        font-size="${pad ? 160 : 200}" font-weight="bold"
        fill="#ffffff" text-anchor="middle">Ed</text>
</svg>`;

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  await sharp(Buffer.from(logo(false))).resize(size, size).png()
    .toFile(`public/icons/icon-${size}.png`);
}
await sharp(Buffer.from(logo(true))).resize(512, 512).png()
  .toFile('public/icons/icon-512-maskable.png');
console.log('Icônes générées dans public/icons/');
```

Run: `node scripts/generate-icons.mjs`
Expected: 3 PNG créés dans `public/icons/`.

- [ ] **Step 2 : Fallback SPA pour Cloudflare Pages**

Créer `public/_redirects` :
```
/* /index.html 200
```

- [ ] **Step 3 : Vérifier le build PWA**

Run: `npm run build`
Expected: `dist/icons/` contient les 3 PNG, `dist/manifest.webmanifest` et `dist/sw.js` présents, `dist/_redirects` copié.

- [ ] **Step 4 : Commit**

```bash
git add scripts public
git commit -m "feat: icônes PWA générées et fallback SPA"
```

---

### Task 6 : Supabase local — schéma, trigger, RPC, RLS

**Files:**
- Create: `supabase/config.toml` (via `supabase init`, puis édité)
- Create: `supabase/migrations/20260710120000_socle.sql`

- [ ] **Step 1 : Initialiser Supabase**

Run: `supabase init`
Expected: dossier `supabase/` avec `config.toml`.

Dans `supabase/config.toml`, activer un OTP de test pour le téléphone en local (section à ajouter/compléter) :
```toml
[auth.sms]
enable_signup = true

[auth.sms.test_otp]
2250700000001 = "123456"
```

- [ ] **Step 2 : Écrire la migration socle**

Créer `supabase/migrations/20260710120000_socle.sql` :
```sql
-- Types énumérés
create type public.classe_niveau as enum (
  'PS','MS','GS','CP1','CP2','CE1','CE2','CM1','CM2',
  '6EME','5EME','4EME','3EME','SECONDE','PREMIERE','TERMINALE'
);
create type public.systeme_educatif as enum ('IVOIRIEN','FRANCAIS','AUTRE');

-- Comptes parents (1-1 avec auth.users)
create table public.parents (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- Profil permanent de l'enfant : ne disparaît jamais
create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  nom text not null,
  prenoms text not null,
  date_naissance date not null,
  sexe text not null check (sexe in ('M','F')),
  photo_path text,
  created_at timestamptz not null default now()
);
create index children_parent_idx on public.children (parent_id);

-- Une inscription par enfant et par année scolaire
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  annee_scolaire text not null check (annee_scolaire ~ '^\d{4}-\d{4}$'),
  classe public.classe_niveau not null,
  etablissement text not null default '',
  systeme public.systeme_educatif not null default 'IVOIRIEN',
  matieres text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (child_id, annee_scolaire)
);
create index enrollments_parent_idx on public.enrollments (parent_id);
create unique index one_active_enrollment_per_child
  on public.enrollments (child_id) where is_active;

-- Création automatique du compte parent à l'inscription auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.parents (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Création atomique enfant + inscription (RLS s'applique : security invoker)
create or replace function public.create_child_with_enrollment(
  p_nom text,
  p_prenoms text,
  p_date_naissance date,
  p_sexe text,
  p_annee_scolaire text,
  p_classe public.classe_niveau,
  p_etablissement text,
  p_systeme public.systeme_educatif,
  p_matieres text[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_child_id uuid;
begin
  insert into public.children (parent_id, nom, prenoms, date_naissance, sexe)
  values (auth.uid(), p_nom, p_prenoms, p_date_naissance, p_sexe)
  returning id into v_child_id;

  insert into public.enrollments
    (child_id, parent_id, annee_scolaire, classe, etablissement, systeme, matieres)
  values
    (v_child_id, auth.uid(), p_annee_scolaire, p_classe, p_etablissement, p_systeme, p_matieres);

  return v_child_id;
end;
$$;

-- RLS : isolation stricte par parent
alter table public.parents enable row level security;
alter table public.children enable row level security;
alter table public.enrollments enable row level security;

create policy parents_select_own on public.parents
  for select using (id = auth.uid());
create policy parents_update_own on public.parents
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy children_own on public.children
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy enrollments_own on public.enrollments
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());
```

- [ ] **Step 3 : Démarrer et appliquer**

Run: `supabase start` puis `supabase db reset`
Expected: migration appliquée sans erreur ; `supabase status` affiche les URLs et clés locales.

- [ ] **Step 4 : Vérification manuelle rapide**

Run: `supabase db lint`
Expected: aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add supabase
git commit -m "feat: schéma Supabase socle (parents, children, enrollments) avec RLS et RPC atomique"
```

---

### Task 7 : Tests d'isolation RLS (intégration)

**Files:**
- Create: `supabase/tests/rls.test.ts`, `vitest.rls.config.ts`, `.env.rls.local` (gitignoré)

- [ ] **Step 1 : Config Vitest dédiée (Node, pas jsdom)**

Créer `vitest.rls.config.ts` :
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 2 : Renseigner les clés locales**

Récupérer les clés : `supabase status`
Créer `.env.rls.local` (ajouter cette ligne à `.gitignore` : `.env*.local`) :
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon key affichée par supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service_role key affichée par supabase status>
```

- [ ] **Step 3 : Écrire les tests RLS (échec impossible à ce stade = bon signe qu'ils testent vraiment : on vérifie d'abord qu'ils échouent si on désactive une policy — voir Step 5)**

Créer `supabase/tests/rls.test.ts` :
```ts
import { config } from 'dotenv';
config({ path: '.env.rls.local' });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function nouveauParent(tag: string): Promise<{ client: SupabaseClient; id: string }> {
  const email = `${tag}-${Date.now()}@test.educi.ci`;
  const password = 'Motdepasse!234';
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createError) throw createError;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, id: data.user.id };
}

describe('Isolation RLS entre parents', () => {
  let parentA: { client: SupabaseClient; id: string };
  let parentB: { client: SupabaseClient; id: string };
  let childAId: string;

  beforeAll(async () => {
    parentA = await nouveauParent('a');
    parentB = await nouveauParent('b');
    const { data, error } = await parentA.client.rpc('create_child_with_enrollment', {
      p_nom: 'Kouassi', p_prenoms: 'Lamine', p_date_naissance: '2019-03-12',
      p_sexe: 'M', p_annee_scolaire: '2026-2027', p_classe: 'CP1',
      p_etablissement: 'EPP Cocody', p_systeme: 'IVOIRIEN',
      p_matieres: ['Français', 'Mathématiques'],
    });
    if (error) throw error;
    childAId = data as string;
  });

  it('le trigger crée la ligne parents à l’inscription', async () => {
    const { data } = await parentA.client.from('parents').select('id');
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(parentA.id);
  });

  it('le parent A voit son enfant et son inscription', async () => {
    const { data } = await parentA.client
      .from('children').select('*, enrollments(*)');
    expect(data).toHaveLength(1);
    expect(data![0].enrollments).toHaveLength(1);
  });

  it('le parent B ne voit pas les enfants du parent A', async () => {
    const { data } = await parentB.client.from('children').select('*');
    expect(data).toHaveLength(0);
  });

  it('le parent B ne peut pas insérer un enfant chez le parent A', async () => {
    const { error } = await parentB.client.from('children').insert({
      parent_id: parentA.id, nom: 'X', prenoms: 'Y',
      date_naissance: '2018-01-01', sexe: 'F',
    });
    expect(error).not.toBeNull();
  });

  it('le parent B ne peut ni modifier ni supprimer l’enfant du parent A', async () => {
    await parentB.client.from('children').update({ nom: 'Piraté' }).eq('id', childAId);
    await parentB.client.from('children').delete().eq('id', childAId);
    const { data } = await parentA.client.from('children').select('nom').eq('id', childAId);
    expect(data).toHaveLength(1);
    expect(data![0].nom).toBe('Kouassi');
  });

  it('le parent B ne voit pas le profil parents du parent A', async () => {
    const { data } = await parentB.client.from('parents').select('id');
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(parentB.id);
  });

  it('deux inscriptions actives pour le même enfant sont refusées', async () => {
    const { error } = await parentA.client.from('enrollments').insert({
      child_id: childAId, parent_id: parentA.id, annee_scolaire: '2027-2028',
      classe: 'CP2', etablissement: 'EPP Cocody', systeme: 'IVOIRIEN',
      matieres: ['Français'],
    });
    expect(error).not.toBeNull(); // index unique one_active_enrollment_per_child
  });
});
```

- [ ] **Step 4 : Exécuter les tests**

Run: `npm run test:rls`
Expected: tous PASS (Supabase local démarré).

- [ ] **Step 5 : Prouver que les tests détectent une faille**

Run (désactive temporairement une policy ; le port 54322 est la base locale) :
```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "drop policy children_own on public.children; create policy tout_ouvert on public.children for select using (true);"
npm run test:rls
```
(Si `psql` n'est pas installé sur le poste : exécuter le même SQL dans Supabase Studio, `http://127.0.0.1:54323` → SQL Editor.)
Expected: le test « le parent B ne voit pas les enfants du parent A » FAIL.
Puis restaurer : `supabase db reset` et re-run `npm run test:rls` → PASS.

- [ ] **Step 6 : Commit**

```bash
git add supabase/tests vitest.rls.config.ts .gitignore
git commit -m "test: isolation RLS entre parents (intégration Supabase local)"
```

---

### Task 8 : Client Supabase typé et variables d'environnement

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/database.types.ts`, `.env.example`, `.env.local` (gitignoré)

- [ ] **Step 1 : Générer les types depuis le schéma**

Run: `supabase gen types typescript --local > src/lib/database.types.ts`
Expected: fichier TypeScript contenant les types `parents`, `children`, `enrollments` et la fonction `create_child_with_enrollment`.

- [ ] **Step 2 : Créer le client unique**

Créer `src/lib/supabase.ts` :
```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

Créer `.env.example` :
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=remplacer-par-la-cle-anon
```
Créer `.env.local` avec les vraies valeurs locales (`supabase status`).

- [ ] **Step 3 : Vérifier**

Run: `npm run typecheck && npm run build`
Expected: succès.

- [ ] **Step 4 : Commit**

```bash
git add src/lib .env.example
git commit -m "feat: client Supabase typé et configuration d'environnement"
```

---

### Task 9 : AuthProvider et route protégée (TDD)

**Files:**
- Create: `src/features/auth/AuthProvider.tsx`, `src/features/auth/ProtectedRoute.tsx`, `src/components/Chargement.tsx`
- Test: `src/features/auth/AuthProvider.test.tsx`

- [ ] **Step 1 : Écrire le test (échec attendu)**

Créer `src/features/auth/AuthProvider.test.tsx` :
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (...a: unknown[]) => mockOnAuthStateChange(...a),
    },
  },
}));

import { AuthProvider, useAuth } from './AuthProvider';

function Sonde() {
  const { session, loading } = useAuth();
  if (loading) return <p>chargement</p>;
  return <p>{session ? 'connecté' : 'déconnecté'}</p>;
}

beforeEach(() => {
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

it('expose la session une fois chargée', async () => {
  const session = { user: { id: 'u1' } } as unknown as Session;
  mockGetSession.mockResolvedValue({ data: { session } });
  render(<AuthProvider><Sonde /></AuthProvider>);
  expect(screen.getByText('chargement')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('connecté')).toBeInTheDocument());
});

it('expose null sans session', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  render(<AuthProvider><Sonde /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('déconnecté')).toBeInTheDocument());
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/auth`
Expected: FAIL — `./AuthProvider` introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/features/auth/AuthProvider.tsx` :
```tsx
import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type AuthState = { session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
```

Créer `src/components/Chargement.tsx` :
```tsx
import { fr } from '../i18n/fr';

export function Chargement() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-slate-500">
      <p role="status">{fr.commun.chargement}</p>
    </div>
  );
}
```

Créer `src/features/auth/ProtectedRoute.tsx` :
```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { Chargement } from '../../components/Chargement';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  if (loading) return <Chargement />;
  if (!session) return <Navigate to="/connexion" replace />;
  return <Outlet />;
}
```

- [ ] **Step 4 : Vérifier le passage**

Run: `npm run test:run -- src/features/auth`
Expected: 2 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/auth src/components
git commit -m "feat: AuthProvider et route protégée"
```

---

### Task 10 : Page de connexion OTP (téléphone / e-mail) (TDD)

**Files:**
- Create: `src/features/auth/LoginPage.tsx`
- Test: `src/features/auth/LoginPage.test.tsx`

- [ ] **Step 1 : Écrire les tests (échec attendu)**

Créer `src/features/auth/LoginPage.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...a: unknown[]) => mockSignInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
    },
  },
}));

import { LoginPage } from './LoginPage';

function rendre() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('envoie un OTP par téléphone (mode par défaut)', async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  rendre();
  await userEvent.type(
    screen.getByLabelText('Numéro de téléphone'), '+2250700000001');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+2250700000001' });
  expect(await screen.findByLabelText('Code reçu')).toBeInTheDocument();
});

it("bascule en mode e-mail et envoie l'OTP par e-mail", async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  rendre();
  await userEvent.click(screen.getByRole('button', { name: 'E-mail' }));
  await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'a@b.ci');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: 'a@b.ci' });
});

it("affiche l'erreur si l'envoi échoue", async () => {
  mockSignInWithOtp.mockResolvedValue({ error: { message: 'boom' } });
  rendre();
  await userEvent.type(
    screen.getByLabelText('Numéro de téléphone'), '+2250700000001');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  expect(await screen.findByText(
    "Impossible d'envoyer le code. Vérifiez votre saisie puis réessayez.",
  )).toBeInTheDocument();
});

it('vérifie le code saisi', async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: null });
  rendre();
  await userEvent.type(
    screen.getByLabelText('Numéro de téléphone'), '+2250700000001');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  await userEvent.type(await screen.findByLabelText('Code reçu'), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
  expect(mockVerifyOtp).toHaveBeenCalledWith({
    phone: '+2250700000001', token: '123456', type: 'sms',
  });
});

it('affiche une erreur si le code est invalide', async () => {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: { message: 'invalid' } });
  rendre();
  await userEvent.type(
    screen.getByLabelText('Numéro de téléphone'), '+2250700000001');
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
  await userEvent.type(await screen.findByLabelText('Code reçu'), '000000');
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
  expect(await screen.findByText('Code invalide ou expiré. Réessayez.'))
    .toBeInTheDocument();
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm run test:run -- src/features/auth/LoginPage`
Expected: FAIL — `./LoginPage` introuvable.

- [ ] **Step 3 : Implémenter la page**

Créer `src/features/auth/LoginPage.tsx` :
```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fr } from '../../i18n/fr';

type Methode = 'telephone' | 'email';
type Etape = 'saisie' | 'code';

export function LoginPage() {
  const navigate = useNavigate();
  const [methode, setMethode] = useState<Methode>('telephone');
  const [identifiant, setIdentifiant] = useState('');
  const [etape, setEtape] = useState<Etape>('saisie');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyerCode(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const { error } = methode === 'email'
      ? await supabase.auth.signInWithOtp({ email: identifiant })
      : await supabase.auth.signInWithOtp({ phone: identifiant });
    setEnCours(false);
    if (error) { setErreur(fr.auth.erreurEnvoi); return; }
    setEtape('code');
  }

  async function verifierCode(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const { error } = methode === 'email'
      ? await supabase.auth.verifyOtp({ email: identifiant, token: code, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: identifiant, token: code, type: 'sms' });
    setEnCours(false);
    if (error) { setErreur(fr.auth.codeInvalide); return; }
    navigate('/', { replace: true });
  }

  const bascule = (m: Methode) => () => {
    setMethode(m);
    setIdentifiant('');
    setEtape('saisie');
    setErreur(null);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-bold text-teal-700">{fr.auth.titre}</h1>
      <p className="mt-1 text-sm text-slate-500">{fr.auth.sousTitre}</p>

      <div className="mt-6 flex rounded-lg bg-slate-100 p-1" role="group">
        <button type="button" onClick={bascule('telephone')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            methode === 'telephone' ? 'bg-white shadow' : 'text-slate-500'}`}>
          {fr.auth.onglets.telephone}
        </button>
        <button type="button" onClick={bascule('email')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            methode === 'email' ? 'bg-white shadow' : 'text-slate-500'}`}>
          {fr.auth.onglets.email}
        </button>
      </div>

      {etape === 'saisie' ? (
        <form onSubmit={envoyerCode} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            {methode === 'telephone' ? fr.auth.champTelephone : fr.auth.champEmail}
            <input
              type={methode === 'telephone' ? 'tel' : 'email'}
              inputMode={methode === 'telephone' ? 'tel' : 'email'}
              placeholder={methode === 'telephone' ? fr.auth.exempleTelephone : ''}
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            />
          </label>
          <button type="submit" disabled={enCours}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {enCours ? fr.auth.envoiEnCours : fr.auth.envoyerCode}
          </button>
        </form>
      ) : (
        <form onSubmit={verifierCode} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            {fr.auth.champCode}
            <input
              inputMode="numeric" autoComplete="one-time-code"
              value={code} onChange={(e) => setCode(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-xl tracking-widest"
            />
          </label>
          <button type="submit" disabled={enCours}
            className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
            {enCours ? fr.auth.verificationEnCours : fr.auth.verifierCode}
          </button>
          <button type="button" onClick={bascule(methode)}
            className="w-full py-2 text-sm text-teal-700">
            {fr.auth.changerIdentifiant}
          </button>
        </form>
      )}

      {erreur && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4 : Vérifier le passage**

Run: `npm run test:run -- src/features/auth`
Expected: tous PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/features/auth
git commit -m "feat: page de connexion OTP téléphone/e-mail"
```

---

### Task 11 : Coquille applicative, routes et pages Accueil/Compte

**Files:**
- Create: `src/components/AppShell.tsx`, `src/features/home/HomePage.tsx`, `src/features/account/AccountPage.tsx`, `src/routes.tsx`
- Modify: `src/main.tsx`, supprimer `src/App.tsx` et `src/App.test.tsx`

- [ ] **Step 1 : AppShell mobile-first**

Créer `src/components/AppShell.tsx` :
```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { fr } from '../i18n/fr';

const lienClasse = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
    isActive ? 'text-teal-700' : 'text-slate-400'}`;

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="sticky top-0 z-10 bg-teal-600 px-4 py-3 text-white shadow">
        <h1 className="mx-auto w-full max-w-2xl text-lg font-bold">{fr.app.nom}</h1>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <nav aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl">
          <NavLink to="/" end className={lienClasse}>{fr.nav.accueil}</NavLink>
          <NavLink to="/enfants" className={lienClasse}>{fr.nav.enfants}</NavLink>
          <NavLink to="/compte" className={lienClasse}>{fr.nav.compte}</NavLink>
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 2 : Pages Accueil et Compte**

Créer `src/features/home/HomePage.tsx` :
```tsx
import { Link } from 'react-router-dom';
import { fr } from '../../i18n/fr';

export function HomePage() {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-slate-800">{fr.accueil.bienvenue}</h2>
      <p className="text-slate-600">{fr.accueil.intro}</p>
      <Link to="/enfants"
        className="inline-block rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white">
        {fr.enfants.ajouter}
      </Link>
    </section>
  );
}
```

Créer `src/features/account/AccountPage.tsx` :
```tsx
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { fr } from '../../i18n/fr';

export function AccountPage() {
  const { session } = useAuth();
  const identifiant = session?.user.phone || session?.user.email || '';
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">{fr.compte.titre}</h2>
      <p className="text-slate-600">
        {fr.compte.identifiant} : <span className="font-medium">{identifiant}</span>
      </p>
      <button type="button" onClick={() => supabase.auth.signOut()}
        className="rounded-lg border border-red-300 px-4 py-2 font-medium text-red-600">
        {fr.auth.deconnexion}
      </button>
    </section>
  );
}
```

- [ ] **Step 3 : Routes et bootstrap**

Créer `src/routes.tsx` :
```tsx
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { LoginPage } from './features/auth/LoginPage';
import { HomePage } from './features/home/HomePage';
import { AccountPage } from './features/account/AccountPage';
import { ChildrenPage } from './features/children/ChildrenPage';
import { NewChildPage } from './features/children/NewChildPage';

export const router = createBrowserRouter([
  { path: '/connexion', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/enfants', element: <ChildrenPage /> },
          { path: '/enfants/nouveau', element: <NewChildPage /> },
          { path: '/compte', element: <AccountPage /> },
        ],
      },
    ],
  },
]);
```

Remplacer `src/main.tsx` :
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { router } from './routes';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
```

Supprimer `src/App.tsx` et `src/App.test.tsx`.

Note : `ChildrenPage` et `NewChildPage` n'existent pas encore — créer des stubs minimaux pour compiler (ils sont implémentés en Task 12) :

`src/features/children/ChildrenPage.tsx` :
```tsx
import { fr } from '../../i18n/fr';
export function ChildrenPage() {
  return <h2 className="text-xl font-bold text-slate-800">{fr.enfants.titre}</h2>;
}
```
`src/features/children/NewChildPage.tsx` :
```tsx
import { fr } from '../../i18n/fr';
export function NewChildPage() {
  return <h2 className="text-xl font-bold text-slate-800">{fr.enfants.ajouter}</h2>;
}
```

- [ ] **Step 4 : Vérifier en local**

Run: `npm run test:run && npm run build && npm run dev`
Expected: tests PASS, build OK ; dans le navigateur (viewport mobile) : redirection vers `/connexion`, connexion avec `+2250700000001` / code `123456` (OTP de test local), navigation par la barre du bas, déconnexion depuis Compte.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat: coquille applicative, routes protégées, pages accueil et compte"
```

---

### Task 12 : Enfants — schéma de formulaire, API, pages (TDD)

**Files:**
- Create: `src/features/children/schema.ts`, `src/features/children/api.ts`
- Modify: `src/features/children/ChildrenPage.tsx`, `src/features/children/NewChildPage.tsx`
- Test: `src/features/children/schema.test.ts`, `src/features/children/api.test.ts`, `src/features/children/NewChildPage.test.tsx`

- [ ] **Step 1 : Tests du schéma zod (échec attendu)**

Créer `src/features/children/schema.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { enfantSchema } from './schema';

const valide = {
  nom: 'Kouassi', prenoms: 'Lamine', dateNaissance: '2019-03-12',
  sexe: 'M', classe: 'CP1', etablissement: 'EPP Cocody',
  systeme: 'IVOIRIEN', matieres: ['Français', 'Mathématiques'],
};

describe('enfantSchema', () => {
  it('accepte un enfant valide', () => {
    expect(enfantSchema.safeParse(valide).success).toBe(true);
  });
  it('refuse un nom vide', () => {
    expect(enfantSchema.safeParse({ ...valide, nom: '' }).success).toBe(false);
  });
  it('refuse une date de naissance future', () => {
    expect(enfantSchema.safeParse({ ...valide, dateNaissance: '2099-01-01' }).success).toBe(false);
  });
  it('refuse une classe inconnue', () => {
    expect(enfantSchema.safeParse({ ...valide, classe: 'CP9' }).success).toBe(false);
  });
  it('exige au moins une matière', () => {
    expect(enfantSchema.safeParse({ ...valide, matieres: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec puis implémenter le schéma**

Run: `npm run test:run -- src/features/children/schema`
Expected: FAIL.

Créer `src/features/children/schema.ts` :
```ts
import { z } from 'zod';
import { CLASSES } from '../../domain/classes';
import { fr } from '../../i18n/fr';

export const enfantSchema = z.object({
  nom: z.string().min(1, fr.validation.requis),
  prenoms: z.string().min(1, fr.validation.requis),
  dateNaissance: z
    .string()
    .min(1, fr.validation.requis)
    .refine((d) => new Date(d) <= new Date(), fr.validation.dateFuture),
  sexe: z.enum(['M', 'F']),
  classe: z.enum(CLASSES),
  etablissement: z.string().min(1, fr.validation.requis),
  systeme: z.enum(['IVOIRIEN', 'FRANCAIS', 'AUTRE']),
  matieres: z.array(z.string()).min(1, fr.validation.matiereMin),
});

export type EnfantFormValues = z.infer<typeof enfantSchema>;
```

Run: `npm run test:run -- src/features/children/schema`
Expected: PASS. Commit :
```bash
git add src/features/children/schema.ts src/features/children/schema.test.ts
git commit -m "feat: schéma de validation du formulaire enfant"
```

- [ ] **Step 3 : Tests de l'API (échec attendu)**

Créer `src/features/children/api.test.ts` :
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

import { creerEnfant, listerEnfants } from './api';

beforeEach(() => vi.clearAllMocks());

describe('creerEnfant', () => {
  it('appelle la RPC atomique avec les bons paramètres', async () => {
    mockRpc.mockResolvedValue({ data: 'child-id', error: null });
    const id = await creerEnfant(
      {
        nom: 'Kouassi', prenoms: 'Lamine', dateNaissance: '2019-03-12',
        sexe: 'M', classe: 'CP1', etablissement: 'EPP Cocody',
        systeme: 'IVOIRIEN', matieres: ['Français'],
      },
      '2026-2027',
    );
    expect(id).toBe('child-id');
    expect(mockRpc).toHaveBeenCalledWith('create_child_with_enrollment', {
      p_nom: 'Kouassi', p_prenoms: 'Lamine', p_date_naissance: '2019-03-12',
      p_sexe: 'M', p_annee_scolaire: '2026-2027', p_classe: 'CP1',
      p_etablissement: 'EPP Cocody', p_systeme: 'IVOIRIEN',
      p_matieres: ['Français'],
    });
  });
  it("propage l'erreur Supabase", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(creerEnfant(
      {
        nom: 'K', prenoms: 'L', dateNaissance: '2019-03-12', sexe: 'M',
        classe: 'CP1', etablissement: 'E', systeme: 'IVOIRIEN', matieres: ['Français'],
      },
      '2026-2027',
    )).rejects.toThrow('boom');
  });
});

describe('listerEnfants', () => {
  it('liste les enfants avec leur inscription active', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });
    const data = await listerEnfants();
    expect(data).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('children');
    expect(select).toHaveBeenCalledWith('*, enrollments(*)');
    expect(eq).toHaveBeenCalledWith('enrollments.is_active', true);
  });
});
```

- [ ] **Step 4 : Vérifier l'échec puis implémenter l'API**

Run: `npm run test:run -- src/features/children/api`
Expected: FAIL.

Créer `src/features/children/api.ts` :
```ts
import { supabase } from '../../lib/supabase';
import type { EnfantFormValues } from './schema';

export type EnfantAvecInscription = {
  id: string;
  nom: string;
  prenoms: string;
  date_naissance: string;
  sexe: string;
  enrollments: {
    id: string;
    annee_scolaire: string;
    classe: string;
    etablissement: string;
    matieres: string[];
    is_active: boolean;
  }[];
};

export async function creerEnfant(
  valeurs: EnfantFormValues,
  anneeScolaire: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_child_with_enrollment', {
    p_nom: valeurs.nom,
    p_prenoms: valeurs.prenoms,
    p_date_naissance: valeurs.dateNaissance,
    p_sexe: valeurs.sexe,
    p_annee_scolaire: anneeScolaire,
    p_classe: valeurs.classe,
    p_etablissement: valeurs.etablissement,
    p_systeme: valeurs.systeme,
    p_matieres: valeurs.matieres,
  });
  if (error) throw error;
  return data as string;
}

export async function listerEnfants(): Promise<EnfantAvecInscription[]> {
  const { data, error } = await supabase
    .from('children')
    .select('*, enrollments(*)')
    .eq('enrollments.is_active', true)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as EnfantAvecInscription[];
}
```

Run: `npm run test:run -- src/features/children/api`
Expected: PASS. Commit :
```bash
git add src/features/children/api.ts src/features/children/api.test.ts
git commit -m "feat: API enfants (création atomique via RPC, liste avec inscription active)"
```

- [ ] **Step 5 : Test du formulaire (échec attendu)**

Créer `src/features/children/NewChildPage.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const mockCreerEnfant = vi.fn();
vi.mock('./api', () => ({
  creerEnfant: (...a: unknown[]) => mockCreerEnfant(...a),
}));

import { NewChildPage } from './NewChildPage';

function rendre() {
  return render(<MemoryRouter><NewChildPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

it('affiche les erreurs de validation sur soumission vide', async () => {
  rendre();
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findAllByText('Ce champ est obligatoire.')).not.toHaveLength(0);
  expect(mockCreerEnfant).not.toHaveBeenCalled();
});

it('préremplit les matières selon la classe choisie', async () => {
  rendre();
  await userEvent.selectOptions(screen.getByLabelText('Classe'), 'CP1');
  expect(screen.getByRole('checkbox', { name: 'Français' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Mathématiques' })).toBeChecked();
});

it('soumet un enfant valide', async () => {
  mockCreerEnfant.mockResolvedValue('child-id');
  rendre();
  await userEvent.type(screen.getByLabelText('Nom'), 'Kouassi');
  await userEvent.type(screen.getByLabelText('Prénoms'), 'Lamine');
  await userEvent.type(screen.getByLabelText('Date de naissance'), '2019-03-12');
  await userEvent.selectOptions(screen.getByLabelText('Sexe'), 'M');
  await userEvent.selectOptions(screen.getByLabelText('Classe'), 'CP1');
  await userEvent.type(screen.getByLabelText('Établissement scolaire'), 'EPP Cocody');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(mockCreerEnfant).toHaveBeenCalledTimes(1);
  const [valeurs, annee] = mockCreerEnfant.mock.calls[0];
  expect(valeurs.nom).toBe('Kouassi');
  expect(valeurs.matieres).toContain('Français');
  expect(annee).toMatch(/^\d{4}-\d{4}$/);
});
```

- [ ] **Step 6 : Implémenter les pages**

Run d'abord : `npm run test:run -- src/features/children/NewChildPage` → FAIL attendu.

Remplacer `src/features/children/NewChildPage.tsx` :
```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CLASSES, anneeScolaire, classeLabel, matieresParDefaut,
} from '../../domain/classes';
import { fr } from '../../i18n/fr';
import { creerEnfant } from './api';
import { enfantSchema, type EnfantFormValues } from './schema';

const champ = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base';
const etiquette = 'block text-sm font-medium text-slate-700';

export function NewChildPage() {
  const navigate = useNavigate();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const {
    register, handleSubmit, control, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<EnfantFormValues>({
    resolver: zodResolver(enfantSchema),
    defaultValues: {
      nom: '', prenoms: '', dateNaissance: '', sexe: 'M',
      classe: 'CP1', etablissement: '', systeme: 'IVOIRIEN',
      matieres: matieresParDefaut('CP1'),
    },
  });
  const classe = watch('classe');

  async function onSubmit(valeurs: EnfantFormValues) {
    setErreurServeur(null);
    try {
      await creerEnfant(valeurs, anneeScolaire(new Date()));
      navigate('/enfants');
    } catch {
      setErreurServeur(fr.commun.erreurInconnue);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-slate-800">{fr.enfants.ajouter}</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
        <label className={etiquette}>{fr.enfants.nom}
          <input {...register('nom')} className={champ} />
          {errors.nom && <p role="alert" className="mt-1 text-sm text-red-600">{errors.nom.message}</p>}
        </label>
        <label className={etiquette}>{fr.enfants.prenoms}
          <input {...register('prenoms')} className={champ} />
          {errors.prenoms && <p role="alert" className="mt-1 text-sm text-red-600">{errors.prenoms.message}</p>}
        </label>
        <label className={etiquette}>{fr.enfants.dateNaissance}
          <input type="date" {...register('dateNaissance')} className={champ} />
          {errors.dateNaissance && <p role="alert" className="mt-1 text-sm text-red-600">{errors.dateNaissance.message}</p>}
        </label>
        <label className={etiquette}>{fr.enfants.sexe}
          <select {...register('sexe')} className={champ}>
            <option value="M">{fr.enfants.garcon}</option>
            <option value="F">{fr.enfants.fille}</option>
          </select>
        </label>
        <label className={etiquette}>{fr.enfants.classe}
          <select
            {...register('classe', {
              onChange: (e) => setValue('matieres', matieresParDefaut(e.target.value)),
            })}
            className={champ}
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>{classeLabel(c)}</option>
            ))}
          </select>
        </label>
        <label className={etiquette}>{fr.enfants.etablissement}
          <input {...register('etablissement')} className={champ} />
          {errors.etablissement && <p role="alert" className="mt-1 text-sm text-red-600">{errors.etablissement.message}</p>}
        </label>
        <label className={etiquette}>{fr.enfants.systeme}
          <select {...register('systeme')} className={champ}>
            {(['IVOIRIEN', 'FRANCAIS', 'AUTRE'] as const).map((s) => (
              <option key={s} value={s}>{fr.enfants.systemes[s]}</option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className={etiquette}>{fr.enfants.matieres}</legend>
          <Controller
            control={control}
            name="matieres"
            render={({ field }) => (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {matieresParDefaut(classe).map((m) => (
                  <label key={m} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={field.value.includes(m)}
                      onChange={(e) =>
                        field.onChange(
                          e.target.checked
                            ? [...field.value, m]
                            : field.value.filter((v) => v !== m),
                        )
                      }
                    />
                    {m}
                  </label>
                ))}
              </div>
            )}
          />
          {errors.matieres && <p role="alert" className="mt-1 text-sm text-red-600">{errors.matieres.message}</p>}
        </fieldset>

        {erreurServeur && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreurServeur}</p>
        )}

        <button type="submit" disabled={isSubmitting}
          className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
          {fr.commun.enregistrer}
        </button>
      </form>
    </section>
  );
}
```

Remplacer `src/features/children/ChildrenPage.tsx` :
```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { classeLabel, type Classe } from '../../domain/classes';
import { fr } from '../../i18n/fr';
import { listerEnfants, type EnfantAvecInscription } from './api';

export function ChildrenPage() {
  const [enfants, setEnfants] = useState<EnfantAvecInscription[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerEnfants()
      .then(setEnfants)
      .catch(() => setErreur(fr.commun.erreurInconnue));
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">{fr.enfants.titre}</h2>
        <Link to="/enfants/nouveau"
          className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white">
          {fr.enfants.ajouter}
        </Link>
      </div>

      {erreur && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}
      {enfants === null && !erreur && <p className="text-slate-500">{fr.commun.chargement}</p>}
      {enfants?.length === 0 && <p className="text-slate-500">{fr.enfants.aucun}</p>}

      <ul className="space-y-2">
        {enfants?.map((e) => {
          const inscription = e.enrollments[0];
          return (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-800">{e.prenoms} {e.nom}</p>
              {inscription && (
                <p className="text-sm text-slate-500">
                  {classeLabel(inscription.classe as Classe)} · {inscription.etablissement} · {inscription.annee_scolaire}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 7 : Vérifier tout**

Run: `npm run test:run && npm run typecheck && npm run build`
Expected: tous les tests PASS, typecheck et build OK.

- [ ] **Step 8 : Vérification de bout en bout locale**

Run: `npm run dev` (Supabase local démarré)
Expected, en viewport mobile : connexion OTP → Enfants → Ajouter un enfant → formulaire prérempli (matières CP1) → enregistrement → l'enfant apparaît dans la liste avec sa classe. Vérifier dans Supabase Studio (`http://127.0.0.1:54323`) que `children` et `enrollments` contiennent les lignes.

- [ ] **Step 9 : Commit**

```bash
git add src/features/children
git commit -m "feat: gestion des profils enfants avec inscription annuelle"
```

---

### Task 13 : CI GitHub Actions, README, déploiement

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1 : Workflow CI**

Créer `.github/workflows/ci.yml` :
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  verifier:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:run
      - run: npm run build
        env:
          VITE_SUPABASE_URL: http://ci.invalid
          VITE_SUPABASE_ANON_KEY: ci
```

- [ ] **Step 2 : README**

Créer `README.md` :
```markdown
# EduCI

L'intelligence artificielle au service de la réussite scolaire — PWA
d'accompagnement scolaire pour les parents (Côte d'Ivoire).

## Démarrage local

Prérequis : Node ≥ 20, Docker Desktop, Supabase CLI.

    npm install
    supabase start          # démarre PostgreSQL/Auth/Storage locaux
    supabase db reset       # applique les migrations
    cp .env.example .env.local   # puis renseigner les clés de `supabase status`
    node scripts/generate-icons.mjs
    npm run dev

Connexion locale de test : téléphone `+2250700000001`, code `123456`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run test` | tests unitaires (watch) |
| `npm run test:run` | tests unitaires (CI) |
| `npm run test:rls` | tests d'isolation RLS (Supabase local requis) |
| `npm run build` | build de production (PWA) |

## Déploiement

- **Frontend** : Cloudflare Pages — build `npm run build`, dossier `dist`,
  variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` du projet hosted.
- **Base** : projet Supabase hosted ; appliquer les migrations avec
  `supabase db push`. Configurer un fournisseur SMS (auth téléphone) dans
  Auth → Providers avant l'ouverture au public.

## Documentation

- Spécification d'architecture : `docs/superpowers/specs/`
- Plans d'implémentation : `docs/superpowers/plans/`
```

- [ ] **Step 3 : Vérification finale complète**

Run: `npm run lint && npm run typecheck && npm run test:run && npm run build && npm run test:rls`
Expected: tout PASS.

- [ ] **Step 4 : Commit**

```bash
git add .github README.md
git commit -m "chore: CI GitHub Actions et documentation de démarrage"
```

---

## Critère de fin du plan 1A

Un parent peut, sur mobile : installer la PWA, se connecter par OTP (téléphone ou e-mail), créer le profil permanent de son enfant avec son inscription 2026-2027, le retrouver après déconnexion/reconnexion — et un autre parent ne peut jamais voir ces données (prouvé par les tests RLS). La CI est verte.

Le **plan 1B (génération de devoirs)** part de ce socle : profils pédagogiques par cycle, Edge Function `generate-homework` (Claude API), quotas de lancement, rendu PDF par niveau, cache offline des devoirs.
