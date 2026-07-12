# EduCI

L'intelligence artificielle au service de la réussite scolaire — PWA
d'accompagnement scolaire pour les parents (Côte d'Ivoire).

## Démarrage local

Prérequis : Node ≥ 22, Docker Desktop. Le CLI Supabase est une dépendance de
développement (utilisé via `npx supabase`), rien d'autre à installer.

    npm install
    npx supabase start           # démarre PostgreSQL/Auth locaux (Docker)
    npx supabase db reset        # applique les migrations
    cp .env.example .env.local   # puis renseigner les clés de `npx supabase status`
    node scripts/generate-icons.mjs   # (déjà committées ; utile après modif du logo)
    npm run dev

Connexion locale de test : téléphone `+2250700000001`, code `123456` (OTP de test
défini dans `supabase/config.toml`, aucun SMS réel envoyé).

### Génération de devoirs (Edge Function)

    # secret local (clé Claude réelle — dépense) :
    cp supabase/functions/generate-homework/.env.example supabase/functions/generate-homework/.env
    # éditer .env, puis :
    npx supabase functions serve generate-homework --env-file supabase/functions/generate-homework/.env

Tests de l'Edge Function (faux serveur Claude, aucune dépense) :

    deno test --allow-net --allow-env supabase/functions/generate-homework/handler.test.ts

En production : `npx supabase secrets set ANTHROPIC_API_KEY=…` puis `npx supabase functions deploy generate-homework`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run test` | tests unitaires (watch) |
| `npm run test:run` | tests unitaires (CI) |
| `npm run test:rls` | tests d'isolation RLS (Supabase local requis, Node ≥ 22) |
| `npm run typecheck` | vérification des types |
| `npm run lint` | analyse statique (oxlint) |
| `npm run build` | build de production (PWA) |

## Déploiement

- **Frontend** : Cloudflare Pages — build `npm run build`, dossier `dist`,
  variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` du projet hébergé.
- **Base** : projet Supabase hébergé ; appliquer les migrations avec
  `npx supabase db push`. Configurer un vrai fournisseur SMS (auth téléphone,
  canal principal) dans Auth → Providers avant l'ouverture au public — la config
  Twilio factice de `supabase/config.toml` ne sert qu'au développement local.

## Documentation

- Spécification d'architecture : `docs/superpowers/specs/`
- Plans d'implémentation : `docs/superpowers/plans/`
