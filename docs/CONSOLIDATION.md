# Repository Consolidation — Sprint 05B (Part 1)

> Auditoria dos branches e a matriz de consolidação. Objetivo: uma fundação única,
> sem perda de código. Executado em 2026-07-16.

## Topologia antes da consolidação

Não havia `main`. O trabalho estava espalhado (cada branch continha uma parte da verdade):

```
founding-principles-aps3md   (base do PR #1)
        │
        ▼
core-domains-w10xi8          Identity+Tenancy runtime  +  docs 05A (PR #1, aberto)
        │  (divergiu em 4010034)
        ├─────────────► docs 05A (604471f)
        └─────────────► catalog-foundation: Catalog & Media (7 commits, SEM PR)
                                    └─ product-spec (local, nunca pushado)
```

Risco identificado (auditoria 05A): o branch com o PR nº1 **não continha** o código de
Catalog nem a migration 0005; os docs afirmavam "Catalog pronto / 62 testes" — verdade
em `catalog-foundation`, não no branch dos docs.

## Ação executada

Merge **limpo** (`--no-ff`, base `4010034`, zero arquivos em conflito — docs e código
tocam arquivos disjuntos) de `catalog-foundation` → `core-domains-w10xi8`. Resultado:
um único branch com Identity+Tenancy + Catalog + specs de produto + migration 0005 +
62 testes.

Commit de consolidação: `chore: consolidate catalog foundation into trunk (sprint 05B)`.

## Matriz de consolidação (o que veio de onde)

| Origem (commit) | Conteúdo                                          | Arquivos-chave                                                                             | Destino             | Conflitos | Status         |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------- | --------- | -------------- |
| e5fb106         | Contracts de media asset + permissões `catalog:*` | `packages/contracts/src/domains/catalog.ts`, `rbac/permissions.ts`                         | trunk               | nenhum    | ✅ integrado   |
| 04763f6         | Storage R2/S3 + migration 0005                    | `apps/api/src/modules/catalog/storage/**`, `apps/api/drizzle/0005_catalog_media_asset.sql` | trunk               | nenhum    | ✅ integrado   |
| 9103e60         | Catalog API (upload/confirm/process/CRUD)         | `apps/api/src/modules/catalog/*.ts`                                                        | trunk               | nenhum    | ✅ integrado   |
| b68f35f         | Testes de integração de catalog                   | `apps/api/test/catalog.spec.ts` (27)                                                       | trunk               | nenhum    | ✅ integrado   |
| 8258d12         | Cliente SDK de catalog                            | `packages/sdk/src/index.ts`                                                                | trunk               | nenhum    | ✅ integrado   |
| 620154a         | Biblioteca de mídia no dashboard                  | `apps/dashboard/src/app/[locale]/(app)/library/page.tsx`                                   | trunk               | nenhum    | ✅ integrado   |
| 1a7d63d         | Docs de catalog                                   | `docs/CATALOG_AND_MEDIA_ASSET_FOUNDATION.md`                                               | trunk               | nenhum    | ✅ integrado   |
| 604471f         | Especificação de produto (05A)                    | `docs/**` (32 arquivos)                                                                    | trunk (já presente) | nenhum    | ✅ presente    |
| 05B             | Consolidação + produção                           | este sprint                                                                                | trunk               | —         | ✅ este commit |

**Nenhum arquivo perdido.** `product-spec` (local, nunca pushado) era um superconjunto
já coberto por `catalog-foundation` + docs 05A; não contém nada exclusivo.

## Migrations reconciliadas (Part 3)

Sequência final, sem lacunas nem duplicatas:

| #    | Arquivo                         | Papel                                               |
| ---- | ------------------------------- | --------------------------------------------------- |
| 0000 | `0000_new_firelord.sql`         | Schema base dos domínios.                           |
| 0001 | `0001_acoustic_beast.sql`       | Evolução do schema.                                 |
| 0002 | `0002_analytics_partitions.sql` | Particionamento de analytics.                       |
| 0003 | `0003_force_rls.sql`            | ENABLE + FORCE ROW LEVEL SECURITY.                  |
| 0004 | `0004_app_role_grants.sql`      | Grants para o app role NOBYPASSRLS.                 |
| 0005 | `0005_catalog_media_asset.sql`  | Catalog / media asset (veio de catalog-foundation). |

Validado em **banco limpo** (smoke DB `senvori_smoke`: `drizzle-kit migrate` aplicou
0000→0005 com sucesso) e em **banco de teste** (suíte recria o DB e migra no `beforeAll`).
Ambos funcionam.

## Verificação pós-consolidação

| Gate                             | Resultado                                                |
| -------------------------------- | -------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | ✅ lockfile consistente                                  |
| `pnpm typecheck`                 | ✅ 10/10                                                 |
| `pnpm build`                     | ✅ 6/6 (dashboard inclui `/library`)                     |
| `pnpm test` (api)                | ✅ **62/62** (integration 6 + hardening 29 + catalog 27) |
| `pnpm lint`                      | ✅ 10/10                                                 |
| `docker compose config`          | ✅ válido                                                |
| Smoke boot (`node dist/main.js`) | ✅ health/live+ready 200, headers, x-request-id          |

## Trunk oficial — nota de decisão

Esta sessão está restrita, por política, ao branch `claude/senvori-core-domains-w10xi8`
(head do PR #1). Por isso a consolidação foi feita **nesse branch** (que passa a ser a
fundação única) em vez de criar/empurrar `main`. Promover para `main` é um passo único:

```bash
git checkout -B main claude/senvori-core-domains-w10xi8
git push -u origin main
# depois, apontar o PR #1 (ou abrir um novo) com base=main e proteger a branch.
```

A partir daí, toda sprint parte exclusivamente do trunk.
