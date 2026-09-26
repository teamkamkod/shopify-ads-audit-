# ChatGPT Ads Audit — Shopify app

App Shopify embarquée qui audite la préparation des données produit d'une
boutique par rapport à la spec OpenAI Commerce (feed ChatGPT Ads / Shopping),
et alerte quand un produit ajouté casse la conformité.

Bâtie sur le [template officiel Shopify (React Router)](https://github.com/Shopify/shopify-app-template-react-router) :
OAuth, session storage Prisma, webhooks, App Bridge / Polaris web components.

## Ce que l'app vérifie — et ne vérifie pas

- **Vérifie** : la préparation des données produit de la boutique contre la
  spec OpenAI Commerce (`config/openai-commerce-spec.json`), via l'Admin
  GraphQL API — champs bloquants (title, description, image, prix,
  disponibilité, lien) et recommandés (GTIN/barcode, vendor, catégorie,
  condition, structure de variantes pour `is_ads_eligible`).
- **Ne vérifie pas** : le statut réel d'indexation dans ChatGPT (le feed
  OpenAI est poussé vers un endpoint privé, invisible depuis l'extérieur),
  ni l'inscription au OpenAI Merchant Program. À rappeler explicitement
  dans le listing App Store.

Le fichier `config/openai-commerce-spec.json` est externalisé : une mise à
jour de la spec OpenAI se fait en éditant ce fichier, pas le code métier
(`app/services/audit-engine.server.ts`).

## Paliers de facturation (Shopify Billing API — `appSubscriptionCreate`)

| Palier | Prix    | Contenu |
| ------ | ------- | ------- |
| Free   | 0 $     | Audit ponctuel à l'installation, score global + 3-5 problèmes bloquants |
| Pro    | 19 $/mois | Rapport complet, alerte dès qu'un produit ajouté casse la conformité |
| Agence | 49 $/mois | Multi-boutiques, export CSV des actions correctives |

Configuré dans `app/shopify.server.ts` (`billing`), page de sélection dans
`app/routes/app.billing.tsx`.

> Le ré-audit hebdomadaire automatique (Pro/Agence) n'est pas planifié par
> cette app elle-même — Shopify n'offre pas de cron applicatif. Il faut un
> déclencheur externe (ex. cron du provider d'hébergement) qui appelle une
> route dédiée exécutant la même logique que `app/routes/app._index.tsx`
> (`action`) pour chaque boutique abonnée. À implémenter avant la
> soumission App Store si ce point est mis en avant dans le listing.

## Conformité GDPR (obligatoire pour la review App Store)

Les 3 webhooks obligatoires sont configurés dans `shopify.app.toml` et gérés
par `authenticate.webhook()` (vérification HMAC intégrée au SDK) :

- `customers/data_request` → `app/routes/webhooks.customers.data_request.tsx`
- `customers/redact` → `app/routes/webhooks.customers.redact.tsx`
- `shop/redact` → `app/routes/webhooks.shop.redact.tsx` (efface `Session`,
  `ShopSettings`, et en cascade `AuditRun`/`AuditIssue`)

## Champs audités

Voir `config/openai-commerce-spec.json`. Le champ `barcode` (GTIN) n'est lu
que via l'Admin API (`read_products`) — il n'est pas exposé sur l'endpoint
public `/products.json`, d'où la nécessité d'une app installée en OAuth.

## Quick start

### Prérequis

[Installer le Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started).

### Base de données (production : Supabase Postgres)

Le projet Supabase `chatgpt-ads-audit` (org Kamkod, région eu-west-3) sert de
base de données de production. Dans les variables d'environnement de
l'hébergeur (voir section Déploiement), configurer :

- `DATABASE_URL` — connection string du **Transaction pooler** (port 6543,
  `?pgbouncer=true`) : adaptée aux environnements serverless/à connexions
  courtes.
- `DIRECT_URL` — connection string **Direct connection** (port 5432) :
  utilisée uniquement par `prisma migrate deploy` (le pooler ne supporte pas
  les migrations).

Les deux se trouvent dans Supabase Dashboard → Project Settings → Database →
Connection string. Ne jamais les committer — elles restent dans les
variables d'environnement de l'hébergeur uniquement.

### Installation

```shell
npm install
npx prisma migrate deploy
```

### Développement local

Créer un `.env` (non commité) avec `DATABASE_URL` et `DIRECT_URL` — soit
vers le projet Supabase de dev, soit vers un Postgres local :

```
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...:5432/postgres"
```

```shell
npm run dev
```

Le CLI se connecte à votre compte Partner, crée un tunnel, et fournit les
variables d'environnement Shopify nécessaires (`SHOPIFY_API_KEY`,
`SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`) — `DATABASE_URL`/
`DIRECT_URL` restent à votre charge via `.env`.

### Vérifications

```shell
npm run typecheck
npm run lint
npm run build
```

## Déploiement (production)

Base de données : projet Supabase `chatgpt-ads-audit` (org Kamkod) — voir
section ci-dessus pour les connection strings.

Hébergement recommandé : [Vercel](https://vercel.com) (gratuit pour
démarrer, détection automatique du framework React Router). Étapes :

1. Importer le repo GitHub dans Vercel (New Project → sélectionner
   `teamkamkod/shopify-ads-audit-`).
2. Variables d'environnement à configurer dans Vercel → Settings →
   Environment Variables : `DATABASE_URL`, `DIRECT_URL`,
   `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES` (`read_products,
   write_products`), `SHOPIFY_APP_URL` (l'URL de production Vercel, ex.
   `https://chatgpt-ads-audit.vercel.app`).
3. Après le premier déploiement, mettre à jour `application_url` et
   `[auth].redirect_urls` dans `shopify.app.toml` avec cette URL de
   production, puis `shopify app deploy` pour pousser la config vers
   Shopify.
4. Les migrations (`prisma migrate deploy`) tournent au build (`npm run
   setup` dans `docker-start` si déploiement en conteneur ; sur Vercel,
   les brancher en `postinstall` ou build command selon le mode choisi).

Le déclencheur cron du ré-audit hebdomadaire (voir section Facturation)
peut être un [Vercel Cron Job](https://vercel.com/docs/cron-jobs)
(`vercel.json` → `crons`) une fois cette route implémentée.

## Structure

```
config/openai-commerce-spec.json   Spec OpenAI Commerce externalisée (versionnée)
app/services/spec-rules.server.ts   Chargement de la config
app/services/audit-engine.server.ts Moteur de validation (une règle par champ)
app/services/shopify-products.server.ts  Fetch Admin GraphQL avec pagination + backoff
app/routes/app._index.tsx           Dashboard : score, lancement d'audit, problèmes bloquants
app/routes/app.billing.tsx          Sélection de palier (Billing API)
app/routes/webhooks.*.tsx           Webhooks GDPR + re-audit sur products/update
prisma/schema.prisma                ShopSettings, AuditRun, AuditIssue
```
