# Deploy & Operations (§12)

> Como subir, migrar, reverter, atualizar, backup/restore e diagnosticar. Fonte única
> de operação da Senvori.

## Pré-requisitos

- Docker + Docker Compose (local/single-host) ou um orquestrador (prod).
- Node 22 + pnpm 10 (para operar fora de container).
- Postgres 16 e Redis 7 acessíveis.
- Variáveis conforme `docs/ENVIRONMENT.md` (secrets no vault).

## Subir o ambiente (local, single-command §7)

```bash
# a partir da raiz do repo
docker compose -f infra/docker/docker-compose.yml up --build
```

Sobe, em ordem: `postgres` (healthcheck) → `redis` → `migrate` (aplica 0000→0005 e sai)
→ `api` (espera migrate; readiness em `/v1/health/ready`) → `dashboard` (espera api sadia).

- API: http://localhost:3001 (rotas sob `/v1`)
- Dashboard: http://localhost:3000
- Worker: `--profile workers` (seam; ver nota no compose — processamento hoje roda
  in-process no `api`).

## Executar migrations

```bash
# dentro do container (feito automaticamente pelo serviço `migrate`) ou local:
DATABASE_URL=... pnpm --filter @senvori/api exec drizzle-kit migrate
```

Migrations são **forward-only** e versionadas (`apps/api/drizzle/*.sql`). Nunca editar
uma migration já aplicada; criar uma nova.

## Atualizar versão (deploy de uma nova release)

1. CI verde no trunk (lint/typecheck/test/build/docker) — pré-condição dura.
2. Build das imagens (CI já publica artifacts; em prod, push para o registry).
3. Rodar `migrate` **antes** de trocar a imagem da API (migrations retrocompatíveis).
4. Deploy rolling da API: novas instâncias sobem, `/v1/health/ready` vira 200, o LB
   passa a rotear; instâncias antigas recebem SIGTERM → **drenam** (readiness 503 por
   `SHUTDOWN_GRACE_MS`) → fecham (pool do PG drena via lifecycle).
5. Deploy do dashboard.
6. Smoke: `curl -f https://<api>/v1/health/ready` + login no dashboard.

## Rollback

- **App:** re-deploy da imagem anterior (tag por SHA). O drain torna isto sem downtime.
- **Banco:** como migrations são forward-only, rollback de schema = migration nova de
  compensação (preferido) **ou** PITR para antes da migration (só se destrutiva e sem
  dados novos). Por isso migrations devem ser **retrocompatíveis** (expand/contract):
  adicionar antes de remover, deploy do código no meio.

## Backup / Restore

Ver `docs/BACKUP.md` (PITR + dump lógico; runbook de DR).

## Troubleshooting

| Sintoma                  | Verificar                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `/v1/health/ready` = 503 | `database:"down"` → PG fora/URL errada; `draining` → instância em shutdown.                                                     |
| API não sobe             | Logs: `Invalid environment: ...` = var faltando (ver ENVIRONMENT.md).                                                           |
| 429 nas respostas        | Rate limit (`RATE_LIMIT_MAX`/`WINDOW`); health é isento.                                                                        |
| Upload falha             | `CATALOG_MAX_UPLOAD_BYTES`, `STORAGE_DRIVER`/R2 creds, espaço em disco.                                                         |
| Sessão não persiste      | `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`, `DASHBOARD_URL` no CORS, cookies cross-site.                                            |
| Vazamento entre empresas | Nunca deveria ocorrer (RLS FORCE + app role NOBYPASSRLS). Se suspeito, abrir incidente e checar se alguém conectou com o owner. |
| Logs sem correlação      | Confira `x-request-id` na request; o gateway deve propagá-lo.                                                                   |

## Observabilidade

Ver `docs/OBSERVABILITY.md` (OTEL/Sentry/Prometheus/Grafana/Uptime Kuma — preparação).

## Nota honesta de prontidão

`docker compose config` valida e o build local (typecheck/build/test/lint) está verde; a
**construção das imagens Docker** e o fluxo de deploy rolling ainda não foram exercitados
num ambiente real nesta sessão (sem daemon de build/orquestrador aqui). O job de Docker
no CI exercita o build das imagens a cada PR.
