# Observability (§10)

> Escopo desta sprint: **preparar a integração**, não montar dashboards. O código já
> emite os sinais base (logs estruturados + request/correlation IDs, readiness/liveness);
> aqui documentamos como plugar OpenTelemetry, Sentry, Prometheus, Grafana e Uptime Kuma
> quando o ambiente for provisionado.

## O que já existe no código (base pronta)

- **Logs estruturados (pino)** via Fastify, nível por `LOG_LEVEL`, JSON em produção.
- **Request ID / Correlation ID**: `genReqId` honra `x-request-id`/`x-correlation-id`
  de entrada ou gera `uuidv7`; ecoado no header de resposta e presente em cada linha de
  log da request. É o eixo de correlação entre serviços.
- **Health probes**: `/v1/health/live` (liveness), `/v1/health/ready` (readiness com
  ping ao banco), `/v1/health` (snapshot). Base para uptime checks e para o LB.
- **Auditoria de negócio** (transacional) já persiste eventos sensíveis no banco.

## OpenTelemetry (traces + metrics)

Ponto de integração: um `tracing.ts` importado **no topo** de `apps/api/src/main.ts`
(antes de qualquer outro import) inicializando o `NodeSDK` com auto-instrumentations
(HTTP, pg). Exporter OTLP para um collector.

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=senvori-api
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

Correlação: injetar o `x-request-id` como span attribute (`senvori.request_id`) para
casar traces com logs. Deps a adicionar quando ligar: `@opentelemetry/sdk-node`,
`@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`.

## Sentry (error tracking)

Ponto de integração: init no bootstrap sob guarda de env (`SENTRY_DSN`), com
`tracesSampleRate` e `environment=NODE_ENV`. Um Nest `ExceptionFilter` reporta exceções
não tratadas com o `x-request-id` como tag. **Nunca** enviar PII/segredos no payload.

```
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

## Prometheus (metrics scrape)

Expor `/v1/metrics` (formato Prometheus) via `@fastify/metrics` ou `prom-client`.
Métricas base: latência por rota (histograma), contagem por status, event-loop lag,
pool do Postgres (idle/total/waiting), fila `transcode_jobs` (profundidade). A rota fica
**fora** do rate-limit e protegida por rede (não exposta publicamente).

```
scrape_configs:
  - job_name: senvori-api
    metrics_path: /v1/metrics
    static_configs: [{ targets: ["api:3001"] }]
```

## Grafana (dashboards)

Consome Prometheus (métricas) + Loki/OTLP (logs) + Tempo (traces). Dashboards mínimos a
criar quando provisionar: **API health** (latência p50/p95/p99, taxa de erro, RPS),
**Postgres** (conexões, locks, RLS deny rate via audit), **Catalog** (uploads,
profundidade da fila de processamento, falhas). Não faz parte desta sprint criar os
painéis — só o data source (Prometheus) é preparado.

## Uptime Kuma (uptime externo)

Monitores externos apontando para:

- `GET /v1/health/ready` (deve responder 200; 503 = drenando/DB fora) — a cada 60s.
- `GET /v1/health/live` (liveness) — a cada 30s.
  Alerta se readiness ficar 503 por > N ciclos. Uptime Kuma sobe como container próprio
  (fora do compose da app) para não cair junto com o alvo.

## Checklist de ativação (quando provisionar)

- [ ] Collector OTLP no ambiente; `tracing.ts` importado no topo do main.
- [ ] `SENTRY_DSN` no vault; ExceptionFilter reportando com request-id.
- [ ] `/v1/metrics` exposto e scrapeado pelo Prometheus (rede interna).
- [ ] Grafana com data sources Prometheus/Loki/Tempo.
- [ ] Uptime Kuma monitorando `/v1/health/ready` e `/live`.
- [ ] Logs enviados a um agregador (Loki/Cloud) com o `x-request-id` indexado.
