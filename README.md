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

- `DATABASE_URL` et `DIRECT_URL` — sur un hébergement VPS/Docker (process
  Node persistant, pas de scale-to-zero serverless), les deux peuvent
  pointer vers la **Direct connection** (port 5432) : le pooler
  transaction-mode (port 6543) sert surtout à limiter les pics de
  connexions serverless, pas nécessaire ici puisque Prisma maintient déjà
  son propre pool de connexions dans un process long-vivant.

Connection string dans Supabase Dashboard → Project Settings → Database.
Ne jamais la committer — elle reste dans les variables d'environnement de
l'hébergeur uniquement.

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

Hébergement : **VPS via Docker** (le `Dockerfile` du repo est déjà prêt à
l'emploi — process Node standard, pas de contrainte d'adapter runtime
particulière puisque `@shopify/shopify-app-react-router` ne supporte que
Node.js de toute façon, pas les runtimes serverless/edge type Cloudflare
Workers).

Étapes :

1. Sur le VPS : `docker build -t chatgpt-ads-audit .` puis lancer le
   conteneur en exposant le port 3000 (`EXPOSE 3000` dans le Dockerfile),
   derrière un reverse proxy (nginx/Caddy) qui gère le TLS.
2. Variables d'environnement à passer au conteneur (`docker run -e ...`
   ou fichier compose) : `DATABASE_URL`, `DIRECT_URL`, `SHOPIFY_API_KEY`,
   `SHOPIFY_API_SECRET`, `SCOPES` (`read_products,write_products`),
   `SHOPIFY_APP_URL` (l'URL publique de production, ex.
   `https://audit.kamkod.com`).
3. `npm run docker-start` (déjà la commande par défaut du Dockerfile)
   exécute `prisma migrate deploy` puis démarre le serveur — les
   migrations tournent donc à chaque démarrage du conteneur.
4. Après le premier déploiement, mettre à jour `application_url` et
   `[auth].redirect_urls` dans `shopify.app.toml` avec cette URL de
   production, puis `shopify app deploy` pour pousser la config vers
   Shopify.

Le déclencheur cron du ré-audit hebdomadaire (voir section Facturation)
peut être un cron système classique (`crontab`) sur le VPS appelant une
route dédiée, une fois cette route implémentée.

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
