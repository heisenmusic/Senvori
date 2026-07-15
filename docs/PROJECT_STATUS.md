# SENVORI 2.0 — PROJECT STATUS REPORT

> ## Atualização — Catalog & Media Asset Foundation (PROMPT 04)
>
> Construída sobre a fundação Identity + Tenancy. Branch
> `claude/senvori-catalog-foundation` (a partir do estado aprovado da Sprint 01;
> não havia `main` e o PR #1 seguia aberto — desvio registrado). Somente fatos
> comprovados por execução:
>
> - **Upload direto seguro:** `POST /v1/catalog/uploads` emite ticket assinado
>   (blob local ou presigned R2); cliente envia bytes direto ao storage;
>   `.../confirm` verifica objeto+tamanho e enfileira. Object keys por ID do
>   sistema (sem traversal), idempotência e claim atômico anti-corrida.
> - **Storage abstraction:** `StorageProvider` com driver local (filesystem,
>   dev/test) e R2 (S3-compatible, produção). Buckets privados; URLs efêmeras.
> - **Processamento assíncrono** (fora do HTTP): worker trigger-driven e
>   tenant-scoped (roda sob role NOBYPASSRLS), `music-metadata` (JS puro, sem
>   ffmpeg/shell) extrai codec/duração/sampleRate/canais/bitrate; checksum +
>   assinatura validados; estados uploading→processing→ready/failed; retry.
> - **RLS + RBAC** (`catalog:*`, tenant-scoped) + **auditoria transacional**
>   (mesma transação, before/after, sem segredos) em todas as mutações.
> - **API/contracts/SDK tipados**; **Dashboard `/library`** ("Biblioteca") com
>   upload progressivo e todos os estados, i18n pt-BR/en-US/es-ES, acessível.
> - **Testes:** 27 de integração de Catalog em PostgreSQL real + storage local
>   (total do repo: 62 testes). Migração aditiva `0005`.
>
> Detalhes em [`CATALOG_AND_MEDIA_ASSET_FOUNDATION.md`](./CATALOG_AND_MEDIA_ASSET_FOUNDATION.md).
> **Licensing NÃO foi implementado** — apenas proveniência declarada e não
> verificada. Scheduling e Player permanecem não iniciados.
>
> ---

> ## Atualização — Identity + Tenancy Runtime concluído (PROMPT 03 + 03D)
>
> A "vertical slice de plataforma autenticada" recomendada na seção 13 deste
> documento foi **implementada e comprovada**. Identity e Tenancy deixaram de
> ser "🟨 estrutura" e são agora **🟩 uma vertical funcional** que serve de base
> para os próximos domínios. Somente fatos comprovados por execução:
>
> - **Runtime tenant context (RLS):** `ContextAuthGuard` → `PermissionGuard` →
>   `TenantContextInterceptor` (AsyncLocalStorage). Toda query de domínio corre
>   dentro de `withTenantContext` (`app.tenant_id` por transação). A aplicação
>   conecta como role **não-owner `NOBYPASSRLS`** — RLS comprovada em runtime.
> - **RBAC hierárquico:** permissão `dominio:recurso:acao` ∧ cobertura de escopo
>   `tenant→country→brand→group→unit`. Negação por padrão. Matriz de escopos
>   testada.
> - **Auditoria transacional:** mutação + `audit_log_entries` na **mesma
>   transação** (`recordInTx`). Falha de auditoria reverte a mutação; sem órfãos.
> - **Better Auth + Identity + Tenancy** com fontes de verdade separadas;
>   `activeOrganizationId` alinhado às memberships (sem lockout).
> - **Endpoints REST** de Members/Invitations/Role-Assignments/Audit-Logs e
>   Brands/Groups/Units/Zones (paginação, busca, filtros, soft delete, permissões).
> - **Dashboard protegido:** login Better Auth, rota protegida, tela de Unidades
>   com estados (loading/erro/vazio/sem-resultado/sem-permissão/sessão-expirada).
> - **Testes de integração:** 33 casos em PostgreSQL real (6 core + 27 hardening),
>   CI verde rodando os testes **antes** do build.
>
> Arquitetura detalhada em [`IDENTITY_TENANCY_RUNTIME.md`](./IDENTITY_TENANCY_RUNTIME.md)
> e papéis de banco em [`DATABASE_ROLES.md`](./DATABASE_ROLES.md). A seção 13
> abaixo (recomendação original) permanece como registro histórico.
>
> ---

Auditoria do estado real do repositório na branch `claude/senvori-core-domains-w10xi8` (5 commits).
Baseado exclusivamente nos arquivos que existem no projeto. Nenhuma implementação foi inventada.

Commits:

- `1157300` feat(api): complete Drizzle data layer for all 14 domains
- `3db5ba6` feat(repo): scaffold phase 0 monorepo foundation
- `246fcd9` Add SENVORI CORE DOMAINS
- `87e3949` Add approved architecture and reference stack document
- `496a6cd` Add Senvori founding principles document

---

## 1. Resumo Executivo

**Estado global: Fase 0 (Fundação) concluída + camada de dados completa. Nenhuma lógica de negócio existe ainda.**

**✅ Implementado e verificado**

- Monorepo pnpm + Turborepo com toolchain completo (TS strict, ESLint, Prettier, Husky, Commitlint, Changesets, CI).
- 3 aplicações que compilam: `api` (NestJS/Fastify), `dashboard` (Next.js), `site` (Next.js).
- 4 packages compartilhados: `contracts`, `ui`, `i18n`, `sdk`.
- **Camada de dados inteira dos 14 domínios**: 15 arquivos de schema Drizzle, 4 migrações, aplicadas e testadas em PostgreSQL 16 real (RLS de isolamento cross-tenant comprovado).
- Autenticação por Better Auth montada em `/v1/auth/*`.
- i18n em 3 idiomas com next-intl.
- Design system inicial com tokens + dark mode.

**🟡 Parcialmente implementado**

- **API**: os 14 módulos de domínio existem, mas 12 são esqueletos vazios (`@Module({})`). Só `health` e `identity` (auth) têm controllers. Zero services, zero DTOs de negócio, zero validações de request.
- **Contracts**: apenas 2 de 14 domínios (identity, tenancy) têm DTOs Zod.
- **Dashboard**: só a home placeholder da Fase 0. Sem autenticação, sem telas de negócio, sem rotas protegidas.
- **RBAC / Multi-tenant runtime**: schema pronto (`role_assignments`, `withTenantContext`), mas nenhum código de request usa isso ainda — não há guard, interceptor nem pipeline que setam `app.tenant_id` por requisição.

**❌ Não existe**

- **Player Flutter** — `apps/player/` não foi criado. Nenhum arquivo Dart, nenhuma estrutura Flutter.
- Qualquer service/controller/DTO de domínio (Catalog, Licensing, Playlists, Scheduling, Campaigns, Fleet, etc.).
- Testes automatizados (nenhum `*.spec.ts`/`*.test.ts` em todo o repo).
- Workers (outbox dispatcher, transcode, compilação de manifest), storage (R2), gateways (Stripe), MQTT, AI gateway, observabilidade (OpenTelemetry/Sentry).

---

## 2. Estrutura do Monorepo

Árvore real (excluindo `node_modules`, `.next`, `dist`, `.turbo`):

```
senvori/
├── apps/
│   ├── api/                         NestJS (Fastify) — monolito modular
│   │   ├── drizzle/
│   │   │   ├── 0000_new_firelord.sql          (13 tabelas núcleo)
│   │   │   ├── 0001_acoustic_beast.sql        (schema completo)
│   │   │   ├── 0002_analytics_partitions.sql  (partições)
│   │   │   ├── 0003_force_rls.sql             (FORCE RLS)
│   │   │   └── meta/ (0000–0003 snapshots + _journal.json)
│   │   ├── src/
│   │   │   ├── main.ts               bootstrap Fastify, prefixo /v1
│   │   │   ├── app.module.ts         importa os 15 módulos
│   │   │   ├── config/env.ts         env validado por Zod
│   │   │   ├── database/
│   │   │   │   ├── database.module.ts       pool pg + Drizzle
│   │   │   │   ├── tenant-context.ts        withTenantContext() (NÃO usado ainda)
│   │   │   │   └── schema/                   15 arquivos (todos os domínios)
│   │   │   └── modules/
│   │   │       ├── health/           health.controller + module
│   │   │       ├── identity/         auth.config + auth.controller + module
│   │   │       └── {tenancy,fleet,catalog,licensing,playlists,
│   │   │            scheduling,campaigns,brand-experience,retail-media,
│   │   │            marketplace,billing,analytics,ai}/   ← só *.module.ts vazio
│   │   ├── drizzle.config.ts · nest-cli.json · tsconfig(.build).json · README.md
│   ├── dashboard/                   Next.js 15 + Tailwind 4 + next-intl + TanStack Query
│   │   └── src/
│   │       ├── app/[locale]/         layout.tsx + page.tsx (placeholder) + globals.css
│   │       ├── components/providers.tsx    (QueryClientProvider)
│   │       ├── i18n/ (routing, request, navigation) · middleware.ts
│   │       └── components.json (config shadcn — sem componentes gerados)
│   └── site/                        Next.js institucional (1 landing)
│       └── src/app/[locale]/ (layout + page) · i18n/ · middleware.ts
├── packages/
│   ├── contracts/  src/{common/primitives, events/envelope,
│   │                    domains/identity, domains/tenancy, openapi}
│   ├── ui/         src/{tokens.ts, styles.css, lib/cn.ts,
│   │                    components/(button,badge,input,table,card,layout)}
│   ├── i18n/       src/index.ts · locales/{pt-BR,en-US,es-ES}.json
│   └── sdk/        src/index.ts (SenvoriClient — transport + health)
├── infra/
│   ├── docker/     docker-compose.yml (pg16+redis7) · Dockerfile.api · Dockerfile.dashboard
│   └── github/     README.md
├── docs/           PRINCIPIOS_FUNDADORES · ARQUITETURA_E_STACK ·
│                   SENVORI_CORE_DOMAINS · DATABASE_ERD · PROJECT_STATUS (este)
├── .github/workflows/ci.yml
├── .husky/ · .changeset/ · eslint.config.mjs · commitlint.config.mjs
└── package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json
```

**Ausência notável:** `apps/player/` (Flutter) — previsto no README/arquitetura, nunca criado.

---

## 3. Dependências

### API (`apps/api`)

| Categoria   | Pacotes (versão declarada)                                                            |
| ----------- | ------------------------------------------------------------------------------------- |
| Framework   | `@nestjs/common/core/config` ^11.1, `@nestjs/platform-fastify` ^11.1, `fastify` ^5.10 |
| ORM / DB    | `drizzle-orm` ^0.45.2, `pg` ^8.16, `drizzle-kit` ^0.31 (dev)                          |
| Auth        | `better-auth` ^1.2                                                                    |
| Validação   | `zod` ^4.1, `@senvori/contracts` (workspace)                                          |
| Utilitários | `reflect-metadata` ^0.2, `rxjs` ^7.8, `uuidv7` ^1.0                                   |

**Não instalado** (correto para a fase, mas relevante ao status): Redis/BullMQ, ioredis, Stripe, cliente R2/S3, FFmpeg wrapper, MQTT, OpenTelemetry, Sentry, WorkOS.

### Dashboard (`apps/dashboard`)

| Categoria     | Pacotes                                                               |
| ------------- | --------------------------------------------------------------------- |
| Framework     | `next` ^15.3, `react`/`react-dom` ^19.1                               |
| UI            | `@senvori/ui` (workspace), `tailwindcss` ^4.1, `@tailwindcss/postcss` |
| i18n          | `next-intl` ^4.1, `@senvori/i18n`                                     |
| Data          | `@tanstack/react-query` ^5.80                                         |
| Contratos/SDK | `@senvori/contracts`, `@senvori/sdk`                                  |

> `components.json` de shadcn/ui existe, mas nenhum componente shadcn foi gerado — os componentes atuais são artesanais no `@senvori/ui`.

### Packages

- **contracts**: `zod` ^4.1 (build: `tsup`).
- **ui**: `@radix-ui/react-slot` ^1.2, `class-variance-authority` ^0.7, `clsx` ^2.1, `tailwind-merge` ^3.3; peer `react` ^19.
- **i18n**: sem deps de runtime (só `tsup`/`typescript` em dev).
- **sdk**: `@senvori/contracts` (workspace); build `tsup`.

---

## 4. Banco de Dados

**Status: ✅ CONCLUÍDO** (schema, migrações, RLS aplicados e verificados em PG16 em sessão anterior).

### Migrações existentes

| Arquivo                         | Conteúdo                          | CREATE TABLE | RLS enable   | Policies | Índices | FKs |
| ------------------------------- | --------------------------------- | ------------ | ------------ | -------- | ------- | --- |
| `0000_new_firelord.sql`         | núcleo (identidade/tenancy)       | 13           | 5            | 5        | 16      | 16  |
| `0001_acoustic_beast.sql`       | schema completo                   | 111          | 90           | 117      | 124     | 198 |
| `0002_analytics_partitions.sql` | partições mensais de eventos      | 7            | 3            | 3        | 5       | 0   |
| `0003_force_rls.sql`            | FORCE RLS em todas as tabelas RLS | 0            | 1 (DO block) | 0        | 0       | 0   |

### Tabelas por domínio (arquivos de schema)

| Domínio                     | Tabelas | Domínio          | Tabelas |
| --------------------------- | ------- | ---------------- | ------- |
| platform (outbox+traduções) | 2       | scheduling       | 5       |
| identity                    | 11      | campaigns        | 8       |
| tenancy                     | 9       | brand-experience | 6       |
| fleet                       | 8       | retail-media     | 8       |
| catalog                     | 12      | marketplace      | 10      |
| licensing                   | 8       | billing          | 12      |
| playlists                   | 7       | analytics        | 10      |
| ai                          | 8       |                  |         |

**Total verificado em runtime (sessão anterior):** 139 tabelas públicas (com partições), 95 com RLS habilitada, 95 com FORCE RLS, 122 policies, 20 partições mensais provisionadas.

### Relacionamentos / Índices / Constraints

- FKs hard: 198 (0001) + 16 (0000). Ordem de dependência documentada em `docs/DATABASE_ERD.md`.
- **FKs lógicas** (sem `REFERENCES`, para evitar ciclos D2): `rights_holders.provider_id`, `purchases.invoice_id`, `schedule_entries.content_id`, `license_asset_links.target_id`, `invoice_lines.ref_id`, refs de eventos do analytics. Integridade dessas dependeria da camada de aplicação — que ainda não existe.
- Unique keys parciais notáveis: `devices` (um device vivo por zona), `subscriptions` (uma assinatura viva por tenant).
- Convenções aplicadas: UUIDv7, `timestamptz` UTC, `archived_at` (soft delete), audit fields, dinheiro `bigint`+ISO 4217.

**Pendente no banco:** nenhum seed de dados de plataforma (países ISO, planos, releases). A função `create_analytics_partitions()` precisa de job mensal (ainda não agendado).

---

## 5. Domínios

Legenda: ⬜ Não iniciado · 🟨 Estrutura criada · 🟧 Parcial · 🟩 Concluído

| Domínio          | Schema DB     | Contracts (Zod)  | Módulo NestJS   | Service/API      | Status geral     |
| ---------------- | ------------- | ---------------- | --------------- | ---------------- | ---------------- |
| Identity         | 🟩 11 tabelas | 🟧 DTOs parciais | 🟧 auth montado | ⬜ sem RBAC/CRUD | **🟧 Parcial**   |
| Tenancy          | 🟩 9 tabelas  | 🟧 DTOs          | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Fleet            | 🟩 8 tabelas  | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Catalog          | 🟩 12 tabelas | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Licensing        | 🟩 8 tabelas  | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Playlists        | 🟩 7 tabelas  | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Scheduling       | 🟩 5 tabelas  | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Campaigns        | 🟩 8 tabelas  | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Brand Experience | 🟩 6 tabelas  | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Retail Media     | 🟩 8 tabelas  | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Marketplace      | 🟩 10 tabelas | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Billing          | 🟩 12 tabelas | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| Analytics        | 🟩 10 tabelas | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |
| AI               | 🟩 8 tabelas  | ⬜               | 🟨 módulo vazio | ⬜               | **🟨 Estrutura** |

Nenhum domínio está "Concluído" na dimensão de aplicação. Identity é o mais avançado (autenticação funcional), mas ainda sem RBAC, sem CRUD de membros/papéis e sem audit log gravando.

---

## 6. API

**Módulos wired em `app.module.ts` (16):** `Config`, `Database`, `Health`, `Identity`, `Tenancy`, `Billing`, `Catalog`, `Licensing`, `Playlists`, `Scheduling`, `Campaigns`, `BrandExperience`, `Fleet`, `RetailMedia`, `Marketplace`, `Analytics`, `Ai`.

**Controllers existentes (2):**

- `health.controller.ts` → `GET /v1/health` (retorna `{status, version}`).
- `auth.controller.ts` → `ALL /v1/auth/*` (ponte Fastify → handler do Better Auth).

**Services:** ❌ nenhum (`0` arquivos `*.service.ts`).
**DTOs de request:** ❌ nenhum `*.dto.ts`. Os contratos Zod vivem em `@senvori/contracts`, mas só cobrem identity/tenancy e não estão ligados a nenhuma rota.
**Validações / pipes / guards / interceptors:** ❌ inexistentes. Não há `ZodValidationPipe`, guard de permissão, nem interceptor de tenant-context.
**OpenAPI:** estrutura de registro (`packages/contracts/src/openapi`) existe, mas sem geração ligada e sem rotas registradas.

Os 12 módulos de domínio contêm apenas `@Module({})` com comentário de fronteira D2. Nenhum expõe rota.

---

## 7. Dashboard

**Páginas:** 1 real — `app/[locale]/page.tsx` (card placeholder "Fase 0 — Fundação"). Existe também `_not-found` gerado pelo Next.
**Layout:** `app/[locale]/layout.tsx` — `<html lang>`, `NextIntlClientProvider`, `Providers` (TanStack Query). `generateStaticParams` para os 3 locales.
**Componentes locais:** apenas `components/providers.tsx` (QueryClient). Os demais vêm de `@senvori/ui`.
**Rotas:** roteamento por locale via `middleware.ts` (matcher exclui api/_next/estáticos) + `i18n/{routing,navigation,request}.ts`. Sem rotas de negócio.
**Autenticação:** ❌ inexistente — busca por `auth|session|login|token` em `apps/dashboard/src` não retorna nada. Não há tela de login, guarda de rota, nem consumo do `/v1/auth`. O `@senvori/sdk` só expõe `health()`.

Status: **🟧 shell de aplicação funcionando (i18n + data provider), zero produto.**

---

## 8. Design System (`packages/ui`)

**Status: 🟧 Parcial — base sólida, cobertura mínima de componentes.**

- **Tokens:** `tokens.ts` (espelho TS) + `styles.css` com bloco `@theme` (Tailwind v4). Cores em **oklch**: rampa `neutral` (0–950), `brand` indigo-violeta (50–950), semânticos (success/warning/danger/info); espaçamento base-4; tipografia (Inter/mono); radius; shadows.
- **Componentes (6 arquivos):** `Button` (cva: primary/secondary/ghost/destructive × sm/md/lg, `asChild` via Radix Slot), `Badge`, `Input`+`Label`, `Table` (+Header/Body/Row/Head/Cell), `Card` (+Header/Title/Description/Content), `Layout` (`Container`, `Stack`, `PageHeader`).
- **Dark mode:** ✅ via `@media (prefers-color-scheme: dark)` sobrescrevendo variáveis de superfície. (Não há toggle `data-theme` manual.)
- **Internacionalização/RTL:** ✅ componentes usam propriedades lógicas (`ps/pe`, `text-start`) — preparado para RTL. Lint `react/jsx-no-literals` bloqueia string hardcoded em `dashboard`/`site`.
- **Temas de marca (Brand Experience):** ⬜ não implementado no runtime (existe só no schema).

Faltam componentes essenciais de um dashboard real: form controls (select, checkbox, radio, switch), dialog/modal, dropdown, toast, tabs, sidebar/nav, data-table com paginação, skeleton.

---

## 9. Player

**Status: ⬜ NÃO INICIADO — não existe.**

- `apps/player/` não existe. `apps/` contém apenas `api`, `dashboard`, `site`.
- Nenhum arquivo Flutter/Dart, `pubspec.yaml`, sync agent, rule engine, audio engine, cache manager, proof-of-play, pairing ou watchdog.
- O contrato do lado do player (Manifest assinado v1, protocolo de sync) está descrito em `SENVORI_CORE_DOMAINS.md` §7 e a tabela `manifests` existe no banco, mas não há contrato Zod nem endpoint `/v1/player/*` implementado.

---

## 10. Segurança

| Item             | Status            | Evidência                                                                                                                                                                                    |
| ---------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Better Auth**  | 🟧 Parcial        | `auth.config.ts`: plugin `organization` + `emailAndPassword` habilitados; `generateId` UUIDv7; convite expira 7d. Montado em `/v1/auth/*`. Sem SSO (WorkOS) e sem plugin `twoFactor` ligado. |
| **RBAC**         | 🟨 Só schema      | Tabela `role_assignments` (papel × membership × escopo hierárquico) e 12 papéis de sistema definidos em `contracts`. Nenhum guard/enforcement — não há verificação de permissão em request.  |
| **Multi-tenant** | 🟧 Parcial        | `tenant_id` em todas as tabelas de negócio; helper `withTenantContext()` existe. Porém não é chamado por nenhum caminho de request (não há interceptor que sete `app.tenant_id`).            |
| **RLS**          | 🟩 Concluído (DB) | 95 tabelas com RLS + FORCE RLS; policy com guarda `NULLIF`; isolamento cross-tenant, shared-read e negação em contexto vazio testados em PG16.                                               |
| **Audit logs**   | 🟨 Só schema      | Tabela `audit_log_entries` (append-only) existe. Nenhum código grava entradas.                                                                                                               |

**Riscos de segurança de runtime** (porque a aplicação não existe ainda):

1. FORCE RLS exige que a API conecte com um role sem BYPASSRLS e não-owner em produção. Hoje migração e app usariam o mesmo papel `senvori` (owner) — o provisionamento do role de aplicação separado não está definido em nenhum lugar do repo.
2. `withTenantContext` sem consumidor = o isolamento por RLS não é exercido em nenhuma rota real ainda.
3. Segredos: `.env.example` documenta chaves; a arquitetura pede vault, mas não há integração de vault (esperado para a fase).

---

## 11. Internacionalização

**Status: 🟩 Infraestrutura concluída · 🟧 cobertura de conteúdo mínima.**

- **Idiomas implementados:** `pt-BR`, `en-US`, `es-ES` (`SUPPORTED_LOCALES`). Default: `en-US`.
- **Preparados na arquitetura (não shipados):** `fr-FR, de-DE, it-IT, ja-JP, ko-KR, zh-CN, ar-SA` (`PLANNED_LOCALES`).
- **Estratégia:** chaves + next-intl; catálogos em `packages/i18n/locales/*.json` (33 chaves cada, paridade entre os 3); `loadMessages`/`resolveLocale` com fallback em cadeia → EN; roteamento por locale via middleware; lint bloqueia literais em componentes.
- **Conteúdo de banco (D8):** tabela `entity_translations` existe (fallback usuário→unidade→tenant→EN), mas nenhum código de resolução foi escrito.
- **Cobertura atual:** só strings de UI da home/nav/site (foundation). Formatação via `Intl` prevista, ainda sem uso real (sem telas de dados).

---

## 12. Débito Técnico

**Drift schema ↔ implementação**

1. `two_factors` existe no schema, mas o plugin `twoFactor` do Better Auth não está ligado em `auth.config.ts` → tabela órfã até habilitar o plugin (ou removê-la).
2. `audit_log_entries`, `outbox_events`, `entity_translations` existem sem nenhum produtor/consumidor.

**Lacunas de execução (o maior débito)** 3. 12 de 14 módulos são vazios: toda a superfície de API `/v1` (§0.3) está por implementar — services, DTOs, guards, interceptor de tenant-context, pipe de validação Zod. 4. `withTenantContext` nunca é invocado → RLS não é exercida em request; risco de, ao implementar rotas, esquecer de aplicá-la. 5. Provisionamento de role de banco da aplicação (não-owner, sem BYPASSRLS) não existe — necessário para o FORCE RLS valer em produção. 6. Contracts cobrem 2/14 domínios; SDK expõe só `health()`. OpenAPI é estrutura sem geração.

**Qualidade / operação** 7. Zero testes em todo o repo; a task `test` do Turbo existe mas nenhum pacote a implementa; o CI não tem gate de teste (só lint/typecheck/build/format). Isolamento RLS foi validado manualmente via psql, sem teste de regressão versionado. 8. Sem observabilidade (OpenTelemetry/Sentry) — a arquitetura (D12) pede "desde o commit 1"; ausente. 9. Infra deferida (esperada, mas pendente): Redis/BullMQ (outbox/transcode/compilação), R2/CDN, Stripe, MQTT, AI gateway, homologação de box Android.

**Atalhos assumidos (documentados)** 10. FKs lógicas cross-domínio dependem de validação de aplicação inexistente. 11. Const `dataExports` renomeada (colisão com `exports` do CommonJS) — a tabela permanece `exports`; divergência nome-de-símbolo × nome-de-tabela a lembrar. 12. `create_analytics_partitions()` precisa de agendador mensal (não configurado).

---

## 13. Próxima Melhor Etapa

**Sprint recomendado: "Vertical slice de plataforma autenticada — Request pipeline + Identity/Tenancy funcionais + RLS em runtime."**

**Por quê (justificativa técnica):**

1. **É o único desbloqueio real.** A camada de dados está 100% pronta e verificada, mas nada a exercita. `withTenantContext` existe e nunca é chamado; a RLS/FORCE só foi provada via psql, não num caminho HTTP. Sem o pipeline de request tenant-scoped, nenhum outro domínio pode ser construído nem testado.

2. **Ataca o maior risco latente.** O FORCE RLS só protege de verdade se a API conectar como role não-owner sem BYPASSRLS. Definir isso agora (role de aplicação + `withTenantContext` num interceptor) evita retrabalho e uma falsa sensação de segurança quando as rotas começarem a surgir.

3. **Segue a ordem de dependência do próprio Core Domains (§19):** Identity e Tenancy são a fundação da qual todos os 12 domínios restantes dependem para escopo e autorização.

4. **Fecha os drifts mais baratos** enquanto o contexto está fresco (plugin `twoFactor` ou remoção da tabela; primeiro produtor de `audit_log_entries`).

**Escopo concreto do sprint (tudo sobre schema/infra que já existem):**

- Interceptor/guard NestJS que: (a) resolve a sessão do Better Auth, (b) abre transação e seta `app.tenant_id` via `withTenantContext`, (c) avalia permissão `dominio:recurso:acao` contra `role_assignments` com escopo hierárquico.
- `ZodValidationPipe` ligando `@senvori/contracts` às rotas.
- Provisionar role de banco da aplicação (não-owner) + doc/migração de grants.
- CRUD de **Tenancy** (brands, groups, units, zones — `/v1/...`) e **Identity** (members, invitations, role-assignments, audit-logs), com os DTOs Zod que já existem para esses dois domínios.
- Gravar `audit_log_entries` nas mutações administrativas.
- **1 teste de integração** provando isolamento RLS num caminho HTTP real e um step de teste no CI.
- Dashboard: tela de login consumindo `/v1/auth` + primeira tela protegida (lista de unidades) — transformando o shell atual em produto navegável.

Isso converte Identity e Tenancy de "🟨 estrutura" para "🟩 concluído" e estabelece o padrão (pipeline + contracts + testes) que os outros 12 domínios vão replicar.
