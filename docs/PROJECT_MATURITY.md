# Project Maturity (§15)

> Estado real por módulo. Atualizar ao fim de cada sprint. Percentuais são estimativas
> honestas de "código funcional e verificado", não aspiração. Última atualização:
> **2026-07-16 — pós Sprint 06 (programming foundation: compiler + API + SDK + dashboard + E2E)**.

## Resumo

| Camada                          | %           | Tendência                                                |
| ------------------------------- | ----------- | -------------------------------------------------------- |
| Infraestrutura / plataforma     | ~80%        | ▲ (05B: consolidação, prod-readiness, Docker, CI docker) |
| Backend (core runtime)          | ~85%        | =                                                        |
| Catalog                         | ~75%        | ▲ (agora integrado no trunk + verificado)                |
| Programming (Playlists)         | ~55%        | ▲ (Sprint 06: compiler + API + SDK + dashboard + E2E)    |
| Dashboard                       | ~32%        | ▲ (05B: library · 06: Programação + Prévia do dia)       |
| Demais domínios de negócio      | ~1–5%       | = (stubs)                                                |
| Especificação de produto        | ~95%        | =                                                        |
| **Produto construído (global)** | **~24–28%** | ▲                                                        |

## Por módulo

| Módulo              | %   | Status                                                                                                                                                                                                                        | Riscos                                                                                                   | Próxima sprint                             | Bloqueadores                                | Dependências               |
| ------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- | -------------------------- |
| **Infraestrutura**  | 80% | Consolidado, prod-ready no código (health/readiness/liveness, graceful shutdown, helmet, CORS, rate limit, compression, structured logs + request IDs), Docker compose (api+dashboard+pg+redis), CI com docker build+artifact | Docker/deploy não exercitados em ambiente real; sem `main` no origin ainda; observabilidade só preparada | Promover trunk→`main`; provisionar staging | Criação de `main` exige permissão de branch | —                          |
| **Backend runtime** | 85% | Tenant context (ALS), RLS FORCE + app role NOBYPASSRLS, RBAC hierárquico deny-by-default, auditoria transacional, Better Auth                                                                                                 | Rate limit in-memory (não distribuído); sem OTEL/Sentry ligados                                          | —                                          | —                                           | Postgres, Redis (opcional) |
| **Identity**        | 80% | members/invites/roles/audit/me + auth                                                                                                                                                                                         | —                                                                                                        | —                                          | —                                           | runtime                    |
| **Tenancy**         | 75% | brands/groups/units/zones; settings parcial                                                                                                                                                                                   | settings (marcas/idiomas/som base) incompleto                                                            | Completar settings (Fase 2)                | —                                           | Identity                   |
| **Catalog**         | 75% | upload→confirm→process, storage local+R2, worker in-process, 27 testes; migration 0005; SDK + dashboard `/library`                                                                                                            | Worker é in-process (sem binário dedicado); reprocessamento em escala não validado                       | —                                          | —                                           | runtime, storage           |
| **Programming**     | 55% | compiler determinístico (16 t) · API `/programs` (preview/publish imutável/versões/assignment) · SDK tipado (22 t) · dashboard "Programação" + Prévia do dia (22 t) · fluxo E2E (§26); migração 0006 aditiva                  | Intelligent Programming Engine (fadiga/rotação avançada entre dias) fora do escopo                       | Sprint 07 (Intelligent Programming Engine) | —                                           | Catalog, Tenancy           |
| **Dashboard**       | 32% | login + units + library + **Programação** (lista/criação/detalhe/Prévia do dia/publicação/histórico); i18n (pt/en/es); a11y; design tokens                                                                                    | 13 telas especificadas, ~2–3 implementadas                                                               | Construir telas Fase 1                     | Backends de Campaigns/Scheduling            | SDK                        |
| **Scheduling**      | 3%  | stub                                                                                                                                                                                                                          | fallback som base / conflitos ainda não codados                                                          | Fase 1 (backend)                           | —                                           | Catalog, Campaigns         |
| **Campaigns**       | 3%  | stub                                                                                                                                                                                                                          | máquina de estados / publicação por escopo                                                               | Fase 1 (backend)                           | —                                           | Catalog, Tenancy           |
| **Fleet**           | 3%  | stub; permissões `fleet:*` declaradas                                                                                                                                                                                         | heartbeat/sync confiável                                                                                 | Fase 2                                     | —                                           | Scheduling                 |
| **Player**          | 0%  | inexistente                                                                                                                                                                                                                   | —                                                                                                        | Fase 2+                                    | Fleet                                       | Fleet                      |
| **Analytics**       | 5%  | stub + partições (0002)                                                                                                                                                                                                       | fonte de verdade de veiculação                                                                           | Fase 3                                     | Dados de veiculação                         | Fase 1–2                   |
| **Retail Media**    | 1%  | stub                                                                                                                                                                                                                          | —                                                                                                        | Fase 3                                     | Analytics                                   | Analytics                  |
| **Marketplace**     | 1%  | stub; sem spec de tela                                                                                                                                                                                                        | —                                                                                                        | Fase 3                                     | Spec                                        | —                          |
| **Billing**         | 1%  | stub                                                                                                                                                                                                                          | —                                                                                                        | Fase 3+                                    | —                                           | Tenancy                    |
| **AI**              | 1%  | stub; padrão de UX especificado                                                                                                                                                                                               | explicabilidade / ação com humano no laço                                                                | Fase 4                                     | Dados Fases 1–3                             | tudo                       |
| **Digital Signage** | 0%  | inexistente                                                                                                                                                                                                                   | —                                                                                                        | pós-Fase 4                                 | —                                           | Fleet/Player               |

## Gates de qualidade (trunk, pós-06)

| Gate                                 | Estado                                          |
| ------------------------------------ | ----------------------------------------------- |
| Typecheck                            | ✅ 10/10                                        |
| Lint                                 | ✅ 10/10                                        |
| Build                                | ✅ 6/6                                          |
| Testes (total)                       | ✅ 137 (API 93 PG real · SDK 22 · Dashboard 22) |
| Migrations (banco limpo + existente) | ✅ 0000→0006                                    |
| Docker compose config                | ✅ válido                                       |
| Smoke boot (health/headers/IDs)      | ✅                                              |
| CI verde                             | ✅ #13 (`5256aa4`) — verify + docker            |

## Dívida aberta (topo)

1. `main` no origin ainda não criado (restrição de branch desta sessão) — trunk é
   `claude/senvori-core-domains-w10xi8`.
2. Docker image build / deploy não exercitados em ambiente real (só `compose config`).
3. Rate limit é in-memory (produção multi-instância pede store Redis).
4. Observabilidade (OTEL/Sentry/Prometheus) preparada, não ligada.
5. Worker de processamento é in-process (sem binário/entrypoint dedicado).
6. 12 módulos de negócio ainda são stubs.
