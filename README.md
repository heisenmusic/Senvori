# Senvori

Global platform for **Brand Experience, Retail Media, Corporate Audio, Digital Signage, Content Marketplace and AI Content**.

## Official foundation documents

Everything in this repository obeys, in order:

1. [`docs/PRINCIPIOS_FUNDADORES.md`](docs/PRINCIPIOS_FUNDADORES.md) — the why.
2. [`docs/ARQUITETURA_E_STACK.md`](docs/ARQUITETURA_E_STACK.md) — the technical decisions (D1–D12).
3. [`docs/SENVORI_CORE_DOMAINS.md`](docs/SENVORI_CORE_DOMAINS.md) — the domain contracts.

Any implementation that contradicts these documents requires revising the document first.

## Monorepo layout

```
apps/
  api/          NestJS (Fastify) — modular monolith, one module per domain
  dashboard/    Next.js — operations dashboard (pt-BR, en-US, es-ES)
  site/         Next.js — institutional site
packages/
  contracts/    Zod schemas, DTOs, event envelope, OpenAPI registry
  ui/           Design system (tokens + components)
  i18n/         Locales, message catalogs, TMS pipeline
  sdk/          Typed TypeScript client for the public API
infra/
  docker/       docker-compose (Postgres 16, Redis 7) + Dockerfiles
  github/       CI/CD notes (workflows live in .github/workflows)
docs/           Official foundation documents
```

## Getting started

```bash
corepack enable                 # pnpm via corepack (Node >= 22)
pnpm install
pnpm build                      # turbo: builds packages then apps
pnpm dev                        # turbo: runs apps in dev mode

# database (requires Docker)
docker compose -f infra/docker/docker-compose.yml up -d
cp .env.example .env
pnpm db:generate                # drizzle-kit: generate migrations from schema
```

## Toolchain

pnpm workspaces · Turborepo · TypeScript strict · ESLint (flat config, i18n literal guard) · Prettier · Husky · Commitlint (conventional commits) · Changesets.
