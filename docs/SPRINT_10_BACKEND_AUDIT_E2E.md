# Sprint 10 — Auditoria do Backend e Plano de Validação E2E

Status: **Auditoria concluída (código, contratos, schema, infra). Roteiro E2E
pronto para execução em ambiente real — nenhuma execução em dispositivo foi
realizada nesta auditoria.** Nenhuma funcionalidade nova foi implementada.

Fontes auditadas: `apps/api/src/modules/fleet/**`, `apps/api/src/modules/catalog/storage/**`,
`packages/contracts/src/domains/player.ts`, `packages/sdk/src/index.ts` (FleetClient),
`apps/dashboard/src/app/[locale]/(app)/devices/**`, `apps/player/lib/**` (10B),
migração `0011_player_activation.sql`, `infra/db/roles.sql`, `infra/docker/docker-compose.yml`,
`apps/api/test/player.spec.ts`, `docs/PLAYER_BACKEND_INTEGRATION.md`, ADRs 0001–0005.

---

## 1. Sumário executivo

A Sprint 10 entregou em **10A** a fundação backend do Player (contratos Zod,
API device-facing `/v1/player/*`, superfície admin `/v1/fleet/*`, extensão
aditiva de schema via migração `0011`, SDK e telas do dashboard) com 13 testes
de integração em Postgres real, e em **10B** os adapters Flutter de produção
(HTTP autenticado, ativação, plano de execução, download com SHA-256 real,
heartbeat, telemetria, probe de conectividade e ciclo de sync) — **sem
verificação em dispositivo real**. O modelo de segurança é sólido:
proof-of-possession na ativação, tokens armazenados apenas como hash sha256,
escopo (tenant/unit/zone) sempre derivado no servidor, RLS FORCE com política
de self-auth para o token do device, auditoria em eventos de ciclo de vida.

Os riscos que o E2E precisa exercitar estão em §5 (achados A1–A10). Os dois
mais relevantes para o fluxo real: **(A1)** `planChanged` é sempre `false` e o
`SyncCycle` só rebusca o plano quando não há plano ativo — mudanças de
programação não chegam a um device em execução sem reiniciar o app; **(A2)** o
app de produção não conecta a UI ao `ActivationController` — a ativação E2E
precisa ser dirigida por chamadas HTTP diretas (roteiro §6, Fase 4) ou por um
driver programático.

---

## 2. Inventário de endpoints do Player

Prefixo global: `v1` (`app.setGlobalPrefix("v1")` em `apps/api/src/main.ts`).

### 2.1 API device-facing — `PlayerController` (`/v1/player/*`)

Todas as rotas são `@Public()` (o guard de sessão humana não se aplica); as
autenticadas usam `DeviceAuthGuard` (Bearer `pdt_…`, hash sha256 consultado via
política RLS `device_tokens_self_auth` + GUC `app.device_token_hash`).

| #   | Método/Rota                           | Auth    | HTTP ok | Request → Response (contrato)                                                                                                                                                                 | Efeitos persistentes                                                                                                                                                                                     |
| --- | ------------------------------------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /v1/player/activation/start`    | pública | 201     | `playerActivationStartRequest` (deviceId local, platform, appVersion, `activationSecretHash` sha256, hardwareModel?, capabilities?) → `{code, expiresAt, pollIntervalSeconds:5}`              | insere `pairing_codes` (status `pending`, TTL 15 min, código 8 chars sem ambíguos)                                                                                                                       |
| 2   | `GET /v1/player/activation/:code`     | pública | 200     | — → `{status, unitName, friendlyName, expiresAt}` (nunca segredos)                                                                                                                            | nenhum                                                                                                                                                                                                   |
| 3   | `POST /v1/player/activation/complete` | pública | 200     | `{code, activationSecret}` → `playerCredentialResponse` (token cru **uma única vez**, tokenExpiresAt 90d, tenantId, unitId, zoneId, unitName, friendlyName, timezone, contractVersion)        | insere `device_tokens` (hash), device → `active` + `paired_at`, pairing → `completed`, auditoria. Replay ⇒ 409; segredo errado ⇒ 403; não claimed/expirado ⇒ 403                                         |
| 4   | `POST /v1/player/session/refresh`     | device  | 200     | — → `playerCredentialResponse` (token novo)                                                                                                                                                   | revoga **todos** os tokens vivos e emite um novo (rotação)                                                                                                                                               |
| 5   | `POST /v1/player/deactivate`          | device  | 204     | —                                                                                                                                                                                             | revoga tokens, device → `decommissioned`, auditoria                                                                                                                                                      |
| 6   | `POST /v1/player/heartbeat`           | device  | 200     | `playerRuntimeStatus` (strict) → `{serverTime, effectivePlanHash(eco), planChanged:false, nextHeartbeatSeconds:60}`                                                                           | upsert `heartbeat_statuses` (projeção quente), device `active` + `installed_version`, append `device_metric_events`                                                                                      |
| 7   | `GET /v1/player/execution-plan`       | device  | 200     | — → `playerExecutionPlanResponse` (items ordenados da versão publicada, overlays, emergencyActive, hashes, `assets[]` com URL assinada + sha256 + size + contentType + duration, `expiresAt`) | nenhum (leitura; assina URLs com TTL `max(900, CATALOG_DOWNLOAD_TTL_SECONDS)`)                                                                                                                           |
| 8   | `POST /v1/player/telemetry`           | device  | 200     | `playerTelemetryBatchRequest` (batchId, playbackEvents ≤200, errorEvents ≤200, total 1–200) → `{batchId, acceptedIds, duplicateIds, rejectedIds}`                                             | eventos com asset → `playback_events` (PK `(id, occurred_at)`, idempotente por `eventId`); markers sem asset → `device_metric_events`; erros → `player_error_events`; bookkeeping em `ingestion_batches` |

### 2.2 Superfície admin — `FleetAdminController` (`/v1/fleet/*`)

Sessão humana (Better Auth, cookie) + RBAC; tenant vindo do contexto autenticado.

| Método/Rota                                 | Permissão             | Descrição                                                                                            |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /v1/fleet/devices`                     | `fleet:device:read`   | lista devices do tenant (com projeção de heartbeat)                                                  |
| `GET /v1/fleet/devices/:id`                 | `fleet:device:read`   | detalhe + runtime (sem segredos, só presença de credencial)                                          |
| `POST /v1/fleet/devices/:id/revoke`         | `fleet:device:manage` | revoga credenciais e descomissiona                                                                   |
| `GET /v1/fleet/devices/:id/playback-events` | `fleet:device:read`   | eventos operacionais recentes                                                                        |
| `GET /v1/fleet/activations/:code`           | `fleet:device:pair`   | consulta ativação pendente                                                                           |
| `POST /v1/fleet/activations/:code/claim`    | `fleet:device:pair`   | `{zoneId, friendlyName?}` — cria o device vinculado à zona, código → `claimed`. **Não emite token.** |

### 2.3 Endpoints de suporte no fluxo E2E

| Rota                                                                                                                        | Papel no fluxo                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /v1/health` · `/v1/health/live` · `/v1/health/ready`                                                                   | probe de conectividade do Player (`HttpConnectivityProbe`) e readiness do orquestrador |
| `POST /v1/auth/sign-up/email` · `POST /v1/auth/sign-in/email`                                                               | sessão do operador (cookie) para as chamadas `/v1/fleet/*`                             |
| `POST /v1/catalog/uploads` → `PUT <url assinada>` → `POST /v1/catalog/uploads/:id/confirm`                                  | ingestão de mídia (asset com checksum/duração)                                         |
| `PUT/GET /v1/catalog/_storage/:token`                                                                                       | blob endpoint assinado do driver **local** (espelha o contrato presigned do R2)        |
| `POST /v1/units` · `POST /v1/units/:unitId/zones`                                                                           | criação de unit + zone (o device vincula-se a uma zone)                                |
| `POST /v1/programs` · `PUT /v1/programs/:id/items` · `POST /v1/programs/:id/versions` · `POST /v1/programs/:id/assignments` | programa → versão publicada (ordem resolvida + planHash) → assignment à unit           |
| `POST /v1/scheduling/effective-plan` (admin)                                                                                | preview do plano efetivo p/ comparar com o que o device recebe                         |

---

## 3. Dependências externas

| Dependência                        | Uso na Sprint 10                                                                                                                                                                                                                | Configuração                                                                                                                                                                                           | Observações de ambiente real                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres 16**                    | toda a persistência; RLS FORCE; partições de analytics (`playback_events`, `device_metric_events`, `player_error_events`); política `device_tokens_self_auth` + GUC `app.device_token_hash` (migração 0011)                     | `DATABASE_URL`; roles `senvori_owner`/`senvori_migrator`/`senvori_app` (**NOBYPASSRLS**) via `infra/db/roles.sql`; migrações drizzle 0000–0011                                                         | a API **deve** conectar como `senvori_app`; conectar como owner/superuser mascara falhas de RLS e invalida o E2E de isolamento                                                  |
| **Storage de mídia**               | URLs assinadas do plano de execução; upload de catálogo                                                                                                                                                                         | `STORAGE_DRIVER=local` (blob endpoint no próprio API, HMAC `storage-signer`) ou `r2` (Cloudflare R2, presign S3 `@aws-sdk/s3-request-presigner`; `R2_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY`) | TTL de download do plano = `max(900s, CATALOG_DOWNLOAD_TTL_SECONDS)`; em modo local a URL aponta para o origin do API — o device precisa alcançá-lo pela rede (não `localhost`) |
| **Redis 7**                        | fila de processamento de mídia (transcode) — compose                                                                                                                                                                            | `REDIS_URL`                                                                                                                                                                                            | fora do caminho crítico device⇄API; necessário para o asset ficar "pronto"                                                                                                      |
| **Dashboard (Next.js)**            | telas `devices` e `devices/[id]`: lista, detalhe, claim de ativação por código, revoke                                                                                                                                          | `NEXT_PUBLIC_API_URL`; CORS/cookies (`DASHBOARD_URL` no API, `credentials: true`)                                                                                                                      | é o caminho humano do passo _claim_; alternativa: curl com cookie (roteiro)                                                                                                     |
| **SDK (`@senvori/sdk`)**           | `FleetClient`: `listDevices`, `getDevice`, `revokeDevice`, `listPlaybackEvents`, `getActivation`, `claimActivation`                                                                                                             | consumido pelo dashboard                                                                                                                                                                               | superfície humana apenas — o Player **não** usa o SDK TS                                                                                                                        |
| **Flutter Player (`apps/player`)** | adapters 10B: `PlayerHttpClient`, `HttpActivationGateway`, `ExecutionPlanGateway`, `HttpAssetTransport` (+SHA-256 real), `HeartbeatClient`, `HttpTelemetryTransport`, `HttpConnectivityProbe`, `SyncCycle`, `ProductionFactory` | `--dart-define=SENVORI_API_BASE_URL=<origin>` (vazio ⇒ Demo Mode)                                                                                                                                      | limitações documentadas (ADR 0005): áudio fake, token em arquivo app-private (não Keystore), cache em dir temporário, UI de ativação não conectada (A2)                         |
| **Better Auth**                    | sessões de operador (cookie) para `/v1/fleet/*` e dashboard                                                                                                                                                                     | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                                                                                                                                                | seed local: `founder@senvori.dev / senvori-demo-1234` (`apps/api/src/scripts/seed.ts`)                                                                                          |

---

## 4. Modelo de dados tocado pelo fluxo (migração 0011 — aditiva)

- `pairing_codes` (**sem RLS por design** — existe antes do tenant): + `status` (`pending→claimed→completed`, `expired/revoked` terminais), `activation_secret_hash`, `zone_id`, `claimed_by/claimed_at`, `completed_at`.
- `device_tokens` (RLS + política self-auth): + `last_used_at` (tocado a cada request autenticado).
- `heartbeat_statuses` (projeção quente, 1 linha/device): + `runtime_state`, `connectivity`, `contract_version`, `effective_plan_hash`, `current_item_id`, `last_error`, `storage`, `last_sync_at`.
- `devices`: reusada; índice único parcial `devices_zone_live_idx` ⇒ **1 device vivo por zona**.
- Analytics reusadas (particionadas): `playback_events` (PK composto `(id, occurred_at)` = chave de idempotência), `device_metric_events`, `player_error_events`, `ingestion_batches`.

---

## 5. Achados da auditoria

Pontos fortes primeiro: ativação proof-of-possession com segredo que nunca
trafega cru; token retornado uma única vez e armazenado só como hash; replay do
`complete` ⇒ 409; escopo 100% derivado no servidor (o device nunca envia
tenant/unit); RLS self-auth minimalista e correta (`token_hash = GUC`); rotação
revoke-all+issue; auditoria nos eventos de ciclo de vida; 13 testes de
integração em Postgres real cobrindo RBAC, cross-tenant, idempotência e rotação.

| ID      | Severidade           | Achado                                                                                                                                                                               | Impacto / recomendação                                                                                                                                                                                                                                                                                                    |
| ------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1**  | **Alta (funcional)** | `PlayerRuntimeService.heartbeat` responde `planChanged: false` sempre (campo "reservado"), e `SyncCycle.tick` só rebusca o plano quando `planStore.active == null \|\| planChanged`. | Um device em execução **nunca** recebe mudanças de programação (nova versão publicada, novo assignment, evento de emergência) até reiniciar o app. O E2E deve comprovar esse comportamento (Fase 8.6) e o produto deve decidir: computar diff de hash no heartbeat, ou rebuscar por TTL (`expiresAt` do plano) no Player. |
| **A2**  | **Alta (produto)**   | `ActivationController` é construído no `ProductionFactory`, mas `PlayerApp`/`PlayerHome` não o renderizam — não há tela de código de ativação no modo produção.                      | O fluxo de ativação no dispositivo real não é acionável pela UI. O E2E valida o backend via HTTP direto (Fase 4) e o app via injeção manual de token ou driver programático. Follow-up já documentado em `PLAYER_BACKEND_INTEGRATION.md`.                                                                                 |
| **A3**  | Média (segurança)    | Endpoints públicos de ativação protegidos apenas pelo rate limit global por IP (300/min); limitador dedicado por código é follow-up declarado.                                       | Enumeração é mitigada por código de 8 chars (alfabeto não ambíguo, ~40 bits) + TTL 15 min + single-use, mas `GET /activation/:code` revela `unitName/friendlyName` após claim. Validar 429 na Fase 8.7 e priorizar o limitador por código.                                                                                |
| **A4**  | Média (plataforma)   | Token do device persistido em arquivo app-private (`DocumentTokenStore`), áudio `FakePlaybackEngine`, storage/cache ancorados em `Directory.systemTemp` (`main.dart`).               | Aceitável para validação; **não** certificar Proof of Play nem endurecimento Android nesta sprint. Riscos documentados no ADR 0005.                                                                                                                                                                                       |
| **A5**  | Média (operação)     | Nenhum job marca devices `offline`; o status permanece `active` indefinidamente após o último heartbeat (dashboard mostra `lastSeenAt`, mas o enum não regride).                     | Presença real deve ser lida por `lastSeenAt`. Validar na Fase 6 e considerar watchdog (follow-up).                                                                                                                                                                                                                        |
| **A6**  | Baixa                | `PlayerActivationService.start` faz até 5 tentativas capturando **qualquer** erro do insert, não apenas colisão de código único.                                                     | Um erro real de banco é re-tentado 5× e sai como erro genérico. Restringir o catch ao código `23505`.                                                                                                                                                                                                                     |
| **A7**  | Baixa                | Markers sem asset são inseridos um a um (loop) em `device_metric_events` e classificados como `accepted` de forma otimista (dedup best-effort sem `RETURNING`).                      | Reenvio de markers pode reportar `accepted` para duplicatas. Comportamento tolerável (métricas), mas documentar; batch insert como melhoria.                                                                                                                                                                              |
| **A8**  | Baixa                | `rejectedIds` nunca é populado: payload inválido rejeita o **batch inteiro** com 400 na borda Zod.                                                                                   | Semântica válida, mas o contrato sugere rejeição por evento. Documentar (o Player deve tratar 400 como batch inválido, não evento).                                                                                                                                                                                       |
| **A9**  | Baixa (capacidade)   | Cada heartbeat (cadência 60 s) grava histórico em `device_metric_events` ⇒ ~1.440 linhas/dia/device + eventos.                                                                       | Partições existem; incluir verificação de crescimento/retention no plano de operação.                                                                                                                                                                                                                                     |
| **A10** | Info                 | `nextHeartbeatSeconds` (60) é retornado mas o app usa `syncInterval` fixo próprio; intervalo adaptativo é follow-up declarado.                                                       | Sem ação nesta sprint; validar apenas que o eco não quebra o parse.                                                                                                                                                                                                                                                       |

---

## 6. Roteiro executável de validação E2E (ambiente real)

Objetivo: comprovar o fluxo completo **ativação → plano → download/verificação
de asset → heartbeat → telemetria → leitura no dashboard**, com API + Postgres

- storage reais e, na Fase 9, o Player Flutter real.

Convenções: shell `bash` com `curl`, `jq`, `openssl`, `psql`. Variáveis:

```bash
export API="http://<host-api>:3001"        # origin alcançável PELO DEVICE (nunca localhost se o device for físico)
export PSQL="postgres://senvori:senvori@<host-db>:5432/senvori"   # apenas para VERIFICAÇÃO
export CJ="/tmp/senvori-e2e-cookies.txt"   # cookie jar do operador
```

### Fase 0 — Provisionamento do ambiente

1. Provisionar roles do banco (uma vez por cluster, como superuser):
   `psql "$SUPERUSER_URL" -v owner_pw=… -v migrator_pw=… -v app_pw=… -f infra/db/roles.sql`
2. Subir a plataforma: `docker compose -f infra/docker/docker-compose.yml up --build -d`
   (o serviço `migrate` aplica 0000–0011 antes do API; conferir `0011_player_activation.sql` aplicado).
3. Confirmar que a API conecta como **senvori_app** (NOBYPASSRLS) — pré-condição dos testes de isolamento.
4. Seed de demonstração (tenant + operador + units): `pnpm --filter @senvori/api exec tsx src/scripts/seed.ts`
   → login `founder@senvori.dev / senvori-demo-1234`.
5. **Gate de regressão**: rodar a suíte existente `apps/api/test/player.spec.ts`
   (13 testes em Postgres real) — precisa estar verde antes do E2E manual.

**Critério:** compose saudável; migração 0011 presente em `drizzle.__drizzle_migrations`; suíte verde.

### Fase 1 — Sanidade da API

```bash
curl -sf "$API/v1/health"        | jq .   # {status:"ok"}
curl -sf "$API/v1/health/live"   | jq .
curl -sf "$API/v1/health/ready"  | jq .   # {status:"ready", database:"up"}
```

**Critério:** os três respondem 200; `ready` reporta `database: up`. (É este
`GET /v1/health` que o `HttpConnectivityProbe` do Player usa.)

### Fase 2 — Sessão do operador e topologia (tenant/unit/zone)

```bash
# sessão (cookie) — Better Auth
curl -sf -c "$CJ" -H 'content-type: application/json' \
  -d '{"email":"founder@senvori.dev","password":"senvori-demo-1234"}' \
  "$API/v1/auth/sign-in/email" | jq .

# unit + zone (o device sempre se vincula a uma ZONE)
UNIT=$(curl -sf -b "$CJ" -H 'content-type: application/json' \
  -d '{"name":"Loja E2E","timezone":"America/Sao_Paulo"}' "$API/v1/units" | jq -r .id)
ZONE=$(curl -sf -b "$CJ" -H 'content-type: application/json' \
  -d '{"name":"Salão"}' "$API/v1/units/$UNIT/zones" | jq -r .id)
echo "unit=$UNIT zone=$ZONE"
```

**Critério:** unit e zone criadas; regra de negócio a lembrar: **uma zona só
aceita um device vivo** (índice único parcial) — usar zona nova por rodada.

### Fase 3 — Conteúdo e programação (pré-condição do plano)

```bash
# 3.1 upload de um áudio real (driver local mostrado; com R2 a URL é presigned do bucket)
UP=$(curl -sf -b "$CJ" -H 'content-type: application/json' \
  -d '{"fileName":"track.mp3","contentType":"audio/mpeg","sizeBytes":'"$(stat -c%s track.mp3)"',"kind":"track","title":"Track E2E"}' \
  "$API/v1/catalog/uploads")
URL=$(echo "$UP" | jq -r .upload.url); UPID=$(echo "$UP" | jq -r .id)
curl -sf -X PUT -H 'content-type: audio/mpeg' --data-binary @track.mp3 "$URL"
curl -sf -b "$CJ" -X POST "$API/v1/catalog/uploads/$UPID/confirm" | jq .
# aguardar processamento (checksum + duração); repetir até status pronto:
curl -sf -b "$CJ" "$API/v1/catalog/items/$UPID" | jq '{status, durationMs, checksum}'
ASSET=$UPID

# 3.2 programa → itens → versão PUBLICADA → assignment à unit
PROG=$(curl -sf -b "$CJ" -H 'content-type: application/json' \
  -d '{"name":"Programa E2E"}' "$API/v1/programs" | jq -r .id)
curl -sf -b "$CJ" -X PUT -H 'content-type: application/json' \
  -d '{"items":[{"assetId":"'"$ASSET"'"}]}' "$API/v1/programs/$PROG/items" | jq .
curl -sf -b "$CJ" -X POST "$API/v1/programs/$PROG/versions" | jq '{id, planHash}'
curl -sf -b "$CJ" -X POST -H 'content-type: application/json' \
  -d '{"targetType":"unit","targetId":"'"$UNIT"'","daysOfWeek":[0,1,2,3,4,5,6],"startTimeLocal":"00:00","endTimeLocal":"23:59","priority":10}' \
  "$API/v1/programs/$PROG/assignments" | jq .
```

**Critério:** asset processado com `checksum` sha256 e `durationMs`; versão
publicada com `planHash`; assignment ativo cobrindo o horário do teste. (Sem
versão publicada o plano do device vem vazio/fallback — isso também é um caso
de teste, ver 8.5.)

### Fase 4 — Ativação do dispositivo (proof-of-possession)

> Executada com `curl` fazendo o papel do device (ver A2). O dashboard pode
> executar o passo _claim_ pela tela **Devices → Activate** (validação humana).

```bash
# 4.1 device: start — só o HASH do segredo trafega
SECRET=$(openssl rand -hex 32)
HASH=$(printf %s "$SECRET" | openssl dgst -sha256 -r | cut -d' ' -f1)
START=$(curl -sf -H 'content-type: application/json' -d '{
  "deviceId":"e2e-device-01","platform":"android","appVersion":"1.0.0",
  "activationSecretHash":"'"$HASH"'",
  "capabilities":{"audioPlayback":true,"secureStorage":false,"keepScreenOn":true,"kioskMode":false}
}' "$API/v1/player/activation/start")
CODE=$(echo "$START" | jq -r .code); echo "código na tela: $CODE"

# 4.2 device: poll → pending
curl -sf "$API/v1/player/activation/$CODE" | jq .    # status: "pending"

# 4.3 operador: consulta + claim (RBAC fleet:device:pair) — via dashboard OU:
curl -sf -b "$CJ" "$API/v1/fleet/activations/$CODE" | jq .
curl -sf -b "$CJ" -H 'content-type: application/json' \
  -d '{"zoneId":"'"$ZONE"'","friendlyName":"Player E2E"}' \
  "$API/v1/fleet/activations/$CODE/claim" | jq .     # cria o device (status pending)

# 4.4 device: poll → claimed (mostra unitName/friendlyName)
curl -sf "$API/v1/player/activation/$CODE" | jq .

# 4.5 device: complete — apresenta o segredo CRU; token retorna UMA vez
CRED=$(curl -sf -H 'content-type: application/json' \
  -d '{"code":"'"$CODE"'","activationSecret":"'"$SECRET"'"}' \
  "$API/v1/player/activation/complete")
TOKEN=$(echo "$CRED" | jq -r .token); DEV=$(echo "$CRED" | jq -r .deviceId)
echo "$CRED" | jq '{deviceId, tenantId, unitId, zoneId, unitName, timezone, tokenExpiresAt}'
```

Verificação em banco (somente leitura):

```sql
-- pairing consumido e device ativo
SELECT status, completed_at IS NOT NULL AS completed FROM pairing_codes WHERE code = :'CODE';
SELECT status, paired_at IS NOT NULL AS paired FROM devices WHERE id = :'DEV';
-- token armazenado APENAS como hash (nunca o valor cru)
SELECT length(token_hash) = 64 AS only_hash, revoked_at IS NULL AS live FROM device_tokens WHERE device_id = :'DEV';
```

**Critérios:** 201 no start; claim exige sessão com `fleet:device:pair`;
complete devolve credencial completa com escopo derivado (tenant/unit/zone que
o device **não** enviou); replay do complete ⇒ **409** (8.1); segredo errado ⇒
**403** (8.2); banco confirma hash-only.

### Fase 5 — Plano de execução + download e integridade do asset

```bash
PLAN=$(curl -sf -H "authorization: Bearer $TOKEN" "$API/v1/player/execution-plan")
echo "$PLAN" | jq '{reasonCode, effectivePlanHash, emergencyActive, items: (.items|length), assets: (.assets|length), expiresAt}'

# download pela URL assinada + verificação sha256 (o que o HttpAssetTransport + Sha256Checksum fazem)
AURL=$(echo "$PLAN" | jq -r '.assets[0].url')
ASHA=$(echo "$PLAN" | jq -r '.assets[0].checksumSha256')
curl -sf -o /tmp/e2e-asset.bin "$AURL"
LOCAL=$(openssl dgst -sha256 -r /tmp/e2e-asset.bin | cut -d' ' -f1)
[ "$LOCAL" = "$ASHA" ] && echo "INTEGRIDADE OK" || echo "FALHA DE CHECKSUM"
```

**Critérios:** plano contém os itens da versão publicada na ordem resolvida,
`effectivePlanHash` estável entre chamadas sem mudança de estado, `assets[]`
com URL assinada válida por ≥ 900 s; download bem-sucedido **sem** credencial
de storage; sha256 local = `checksumSha256`; após `expiresAt`, a URL assinada
deve falhar (testar com `CATALOG_DOWNLOAD_TTL_SECONDS` reduzido em staging).
Executar **duas vezes**: `STORAGE_DRIVER=local` e `STORAGE_DRIVER=r2`.

### Fase 6 — Heartbeat

```bash
HB() { curl -sf -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "appVersion":"1.0.0","contractVersion":"1.0.0","platform":"android",
  "runtimeState":"'"$1"'","connectivity":"online",
  "activePlanHash":null,"effectivePlanHash":"'"$(echo "$PLAN"|jq -r .effectivePlanHash)"'",
  "currentItemId":null,"positionMs":0,
  "storage":{"totalBytes":64000000000,"freeBytes":32000000000,"cacheBytes":100000000},
  "assetCount":1,"outboxSize":0,"lastSyncAt":null,"lastError":null,
  "reportedAt":"'"$(date -u +%FT%TZ)"'"
}' "$API/v1/player/heartbeat"; }
HB playing | jq .   # {serverTime, planChanged:false, nextHeartbeatSeconds:60}

# leitura no caminho humano (o que o dashboard mostra)
curl -sf -b "$CJ" "$API/v1/fleet/devices/$DEV" | jq '{status, lastSeenAt, runtimeState, connectivity, effectivePlanHash}'
```

```sql
SELECT runtime_state, connectivity, effective_plan_hash, last_seen_at FROM heartbeat_statuses WHERE device_id = :'DEV';
SELECT count(*) FROM device_metric_events WHERE device_id = :'DEV';
```

**Critérios:** projeção quente atualizada (1 linha por device); histórico
cresce a cada batida; `GET /v1/fleet/devices/:id` reflete o runtime; dashboard
(`/devices/[id]`) exibe o mesmo estado. Registrar A5: status não regride a
`offline` sem heartbeat — presença deve ser lida por `lastSeenAt`.

### Fase 7 — Telemetria (idempotência de ingestão)

```bash
EV=$(uuidgen); BATCH=$(uuidgen); NOW=$(date -u +%FT%TZ)
TB='{"batchId":"'"$BATCH"'","playbackEvents":[{
  "eventId":"'"$EV"'","type":"playback_completed","planVersion":null,
  "effectivePlanHash":"'"$(echo "$PLAN"|jq -r .effectivePlanHash)"'",
  "itemId":"0","assetId":"'"$ASSET"'","startedAt":"'"$NOW"'","endedAt":null,
  "positionMs":180000,"durationMs":180000,"completionPct":100,
  "source":"program","reason":null,"appVersion":"1.0.0"}],"errorEvents":[]}'
curl -sf -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "$TB" "$API/v1/player/telemetry" | jq .   # acceptedIds: [EV]
# reenvio do MESMO batch (retry do outbox offline-first):
curl -sf -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "$TB" "$API/v1/player/telemetry" | jq .   # duplicateIds: [EV], acceptedIds: []

curl -sf -b "$CJ" "$API/v1/fleet/devices/$DEV/playback-events" | jq '.items | length'
```

```sql
SELECT count(*) FROM playback_events WHERE id = :'EV';          -- exatamente 1 (nunca 2)
SELECT event_count, duplicate_count, status FROM ingestion_batches WHERE device_id = :'DEV' ORDER BY created_at DESC LIMIT 2;
```

**Critérios:** 1ª chamada ⇒ `acceptedIds=[EV]`; 2ª (retry) ⇒
`duplicateIds=[EV]` e **uma única** linha em `playback_events`
(proof-of-ingestion idempotente); `ingestion_batches` registra os dois batches
com `duplicate_count` correto; o evento aparece no endpoint admin e na tela do
device no dashboard.

### Fase 8 — Casos negativos e segurança (obrigatórios)

| #    | Teste                        | Comando (resumo)                                                                          | Esperado                                                                                                     |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 8.1  | Replay do complete           | repetir 4.5                                                                               | **409** `ACTIVATION_ALREADY_USED`                                                                            |
| 8.2  | Segredo errado               | complete com outro secret em código novo claimed                                          | **403** `ACTIVATION_SECRET_MISMATCH`                                                                         |
| 8.3  | Complete sem claim           | start → complete direto                                                                   | **403** `ACTIVATION_NOT_CLAIMED`                                                                             |
| 8.4  | Token forjado/ausente        | `Bearer pdt_forjado` e sem header em `/execution-plan`                                    | **401** `DEVICE_TOKEN_INVALID` / `DEVICE_UNAUTHENTICATED`                                                    |
| 8.5  | Cross-tenant                 | operador de outro tenant chama `GET /v1/fleet/devices/$DEV` e claim de código do tenant A | **404/403** — RLS nega (validar conectado como `senvori_app`)                                                |
| 8.6  | **Propagação de plano (A1)** | com device rodando plano X, publicar nova versão; observar heartbeats seguintes           | `planChanged` permanece `false` — device **não** rebusca; documentar como limitação aceita ou abrir correção |
| 8.7  | Rate limit                   | >300 req/min de um IP em `/v1/player/activation/*`                                        | **429**; `/v1/health` isento                                                                                 |
| 8.8  | Batch inválido/oversized     | 201 eventos, ou batch vazio                                                               | **400** na borda Zod (batch inteiro; `rejectedIds` não é usado — A8)                                         |
| 8.9  | Rotação de sessão            | `POST /v1/player/session/refresh`; usar token antigo                                      | novo token funciona; antigo ⇒ **401** `DEVICE_TOKEN_REVOKED`                                                 |
| 8.10 | Revogação admin              | `POST /v1/fleet/devices/$DEV/revoke` (precisa `fleet:device:manage`)                      | device `decommissioned`; qualquer chamada device ⇒ **401**; zona liberada para novo pareamento               |
| 8.11 | Expiração de código          | esperar TTL (ou reduzir em staging) e dar claim/complete                                  | **403** `ACTIVATION_EXPIRED`                                                                                 |
| 8.12 | Um device por zona           | segunda ativação na mesma zona com device vivo                                            | claim falha (índice único `devices_zone_live_idx`)                                                           |

### Fase 9 — Fluxo real com o Flutter Player (validação em dispositivo)

Pré-requisitos: toolchain Flutter; API alcançável pelo device (IP/hostname real,
HTTPS recomendado); asset e programação das Fases 2–3.

```bash
cd apps/player
flutter test                                            # gate: unit tests dos adapters 10B
flutter run --dart-define=SENVORI_API_BASE_URL=https://api.<host> -d <device>
```

Roteiro no dispositivo:

1. **Boot**: fases de boot visíveis (sem spinner infinito); Demo Mode **não**
   deve estar ativo (base URL fornecida).
2. **Ativação**: enquanto a UI não expõe o `ActivationController` (A2), validar
   por uma das vias: (a) executar a Fase 4 via curl e injetar a credencial no
   `DocumentTokenStore` do app; ou (b) driver programático chamando
   `ActivationController.start/complete`. Registrar explicitamente qual via foi
   usada no relatório.
3. **Sync**: com token presente, observar o `SyncCycle` (kick imediato +
   intervalo fixo): heartbeat aparece no dashboard, plano é aplicado
   (validate → stage → ensure-assets → activate), assets baixados no cache com
   verificação SHA-256 (log `checksum` em caso de corrupção).
4. **Telemetria**: eventos de playback (do engine fake — A4) drenados do outbox
   para `/v1/player/telemetry`; conferir `playback_events` e a tela do device.
5. **Offline-first**: derrubar a rede do device — playback continua com cache;
   outbox acumula; restaurar rede — outbox drena com `duplicateIds` em retries;
   `heartbeat_statuses` volta a atualizar.
6. **Restart**: matar e reabrir o app — plano restaurado do disco; após
   restart, plano novo é buscado (único caminho hoje de pegar mudanças — A1).

**Critérios:** cada passo acima observável em dashboard + SQL; limitações A1/A2/A4
registradas como "conhecidas e aceitas" ou promovidas a bugs bloqueantes.

### Fase 10 — Encerramento e limpeza

```bash
curl -sf -X POST -H "authorization: Bearer $TOKEN" "$API/v1/player/deactivate" -o /dev/null -w '%{http_code}\n'  # 204
curl -sf -H "authorization: Bearer $TOKEN" "$API/v1/player/execution-plan" -o /dev/null -w '%{http_code}\n'      # 401
curl -sf -b "$CJ" "$API/v1/fleet/devices/$DEV" | jq .status   # "decommissioned"
```

**Critério:** 204 no deactivate; tokens revogados; device `decommissioned`;
zona liberada; nada do teste vazou para outro tenant.

---

## 7. Matriz de rastreabilidade (dependência × fase)

| Dependência                              | Fases que a exercitam                         |
| ---------------------------------------- | --------------------------------------------- |
| Postgres (RLS, partições, GUC self-auth) | 0, 4–8 (todas as verificações SQL), 8.5       |
| Storage local                            | 3, 5                                          |
| Storage R2                               | 5 (rodada dedicada com `STORAGE_DRIVER=r2`)   |
| Dashboard                                | 4.3 (claim pela UI), 6, 7, 8.10               |
| SDK (`FleetClient`)                      | 4.3, 6, 7, 8.10 (é o transporte do dashboard) |
| Flutter Player (adapters 10B)            | 9 (integral), 1 (probe de health)             |
| Better Auth / RBAC                       | 2, 4.3, 8.5, 8.10                             |

## 8. Registro de execução (preencher ao rodar)

| Fase      | Data | Executor | Resultado | Evidência (log/print/SQL) |
| --------- | ---- | -------- | --------- | ------------------------- |
| 0–1       |      |          |           |                           |
| 2–3       |      |          |           |                           |
| 4         |      |          |           |                           |
| 5 (local) |      |          |           |                           |
| 5 (r2)    |      |          |           |                           |
| 6–7       |      |          |           |                           |
| 8.1–8.12  |      |          |           |                           |
| 9         |      |          |           |                           |
| 10        |      |          |           |                           |

**Critério de saída da Sprint 10:** Fases 0–8 e 10 verdes em staging com
`STORAGE_DRIVER=r2`; Fase 9 executada em ao menos um dispositivo Android real,
com A1/A2/A4 formalmente aceitos como limitações documentadas ou convertidos em
issues bloqueantes da Sprint 11.
