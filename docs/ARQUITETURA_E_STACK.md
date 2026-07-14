# SENVORI

## Arquitetura e Stack de Referência

Versão 1.0 | Julho 2026 | Documento vivo, companheiro dos Princípios Fundadores

Este documento traduz os 10 princípios em decisões técnicas. Cada decisão indica o que fica travado desde o dia 1 e o que fica adiado de propósito. Regra de leitura: global first é decisão de schema e contrato hoje, implementação amanhã.

---

## 1. Visão macro: três planos

**Plano de Controle (cloud)**
Onde vivem tenants, unidades, catálogo, licenciamento, campanhas, agendamento, billing, marketplace e IA. É o cérebro. Distribui regras, nunca executa playback.

**Plano de Conteúdo (CDN)**
Áudio, vídeo e assets distribuídos globalmente por CDN, com cache local no player. Conteúdo é baixado, nunca streaming ao vivo como dependência.

**Plano de Execução (edge)**
O player instalado na loja. Recebe regras e conteúdo, executa 100% localmente no timezone da unidade, funciona offline por dias e reporta telemetria quando há rede.

Regra de ouro: o plano de controle pode cair por horas sem que nenhuma loja perca áudio. Toda decisão de arquitetura é testada contra essa frase.

---

## 2. Decisões estruturais

### D1. TypeScript ponta a ponta

Uma linguagem só no monorepo: API, dashboard, contratos, SDK e site. Node 22 LTS.
Por quê: velocidade de um time pequeno, contratos compartilhados entre backend e front, contratação fácil.
Descartado: Go ou Elixir no backend. Ganho técnico real, custo de contexto alto demais nesta fase.

### D2. Monolito modular, não microservices

Uma API NestJS (adapter Fastify) com módulos que espelham domínios: identity, tenancy, catalog, licensing, scheduling, fleet, campaigns, billing, ai, marketplace.
Por quê: microservices no dia 1 é pagar o custo de sistema distribuído sem ter o problema. Módulos com fronteiras limpas permitem extrair serviços depois, um por vez.
Regra: nenhum módulo importa código interno de outro. Comunicação só por interfaces públicas ou eventos.

### D3. PostgreSQL como fonte única de verdade

PostgreSQL 16 gerenciado. Multi-tenant em schema compartilhado: toda tabela de negócio carrega `tenant_id`, com Row Level Security ativa e `app.tenant_id` setado por request.
Por quê: RLS transforma vazamento entre tenants de bug de aplicação em impossibilidade de banco. 100 mil lojas é volume trivial para Postgres em dados de negócio.
Eventos de telemetria: tabelas particionadas por tempo no MVP. ClickHouse entra na fase 2, quando analytics doer.
ORM: Drizzle (migrations versionadas, SQL explícito, convive bem com RLS).

### D4. Modelo de tempo

- Tudo persiste em UTC (`timestamptz`).
- Cada unidade carrega timezone IANA (`America/Sao_Paulo`, `Europe/Madrid`).
- Regras de agendamento são definidas em horário de parede local (RRULE, semântica iCal RFC 5545).
- O servidor compila as regras em um manifest materializado de 7 dias por unidade. O player também carrega o motor de regras, por resiliência.
- Política de DST explícita: horário inexistente pula para o próximo minuto válido; horário duplicado executa uma vez, na primeira ocorrência.

### D5. Player offline-first

O player é um app Flutter. Android primeiro (boxes e tablets baratos dominam o varejo), Windows e web player na sequência, mesma base de código.
Por quê Flutter: uma base para 3 plataformas, você domina o framework, e o áudio no Android roda sobre ExoPlayer via just_audio (gapless, crossfade, ducking).
Fallback declarado: se algum box homologado exigir controle de OS que o Flutter não dá, o player Android vira Kotlin nativo. A decisão é por plataforma, não global.

### D6. Sincronização por manifest assinado

- MVP: polling HTTPS a cada 60 a 300s com jitter, `ETag`/`If-None-Match`, delta por versão.
- Manifests assinados com Ed25519. O player valida com chave pública embarcada e aplica atomicamente. CDN comprometida não injeta conteúdo.
- Fase 2: MQTT (EMQX) para push instantâneo de comandos e invalidação. O polling continua existindo como rede de segurança.

### D7. Conteúdo em R2 + Cloudflare CDN

Cloudflare R2 como object storage, CDN Cloudflare na frente, URLs assinadas com expiração.
Por quê: egress zero do R2. Numa plataforma que distribui áudio para dezenas de milhares de lojas, taxa de saída de S3 clássico vira a maior linha de custo da empresa.
Pipeline de mídia: upload, transcode em workers FFmpeg (fila), normalização de loudness EBU R128 com alvo único da plataforma, saída AAC em duas qualidades (padrão e link ruim), hash de integridade por asset.

### D8. i18n de infraestrutura, não de tradução

- Strings de UI: chaves + ICU MessageFormat (plural, gênero, interpolação). Zero texto hardcoded, com lint bloqueando string literal em componente.
- TMS central: Tolgee self-hosted (alternativa: Crowdin). PT-BR, EN e ES desde o dia 1.
- Formatação de data, número e moeda sempre via `Intl`, nunca manual.
- Conteúdo de banco (nomes de campanha, descrições): tabela de tradução por entidade (`entity_id`, `locale`, `field`, `value`) com fallback em cadeia (locale do usuário, locale da unidade, locale do tenant, EN).
- RTL preparado desde já: propriedades CSS lógicas (`margin-inline-start`, não `margin-left`) e layout espelhável. Árabe entra sem reescrever o front.

### D9. Dinheiro

- No banco: inteiro em unidade mínima + código de moeda ISO 4217. Nunca float, nunca moeda implícita.
- Preço é price list por mercado, nunca conversão automática de câmbio.
- Billing: Stripe Billing como espinha internacional + adaptador de gateway local onde a cobertura pedir (Pix e boleto no Brasil via Stripe, Mercado Pago ou Asaas, atrás da mesma interface).
- MVP cobra em BRL. O schema já nasce multi-moeda.

### D10. Licenciamento como entidade de primeira classe

Todo conteúdo referencia licenças com escopo: território, janela temporal, tipo de uso, origem (catálogo próprio, parceiro, gerado). Disponibilidade de conteúdo para uma unidade é uma query sobre licenças, nunca um `if` no código.
Por quê: cada país tem regime próprio e entidade de gestão coletiva própria para música em ambiente comercial. O motor de playlists só oferece o que a unidade pode tocar. Proof-of-play (D12) é o registro auditável que sustenta relatórios de execução para detentores de direitos e para o marketplace.

### D11. Identidade e acesso

- Usuários: Better Auth self-hosted com plugin de organizações. Evita custo por MAU num negócio de 100 mil lojas. SSO enterprise (SAML/OIDC via WorkOS) na fase 2, quando a primeira grande rede exigir.
- Dispositivos: pairing code na tela do player, claim no dashboard, token de dispositivo rotativo com escopo mínimo. Dispositivo nunca usa credencial de usuário.
- RBAC com escopo hierárquico: papel pode valer para o tenant inteiro, um país ou uma unidade.

### D12. Observabilidade desde o commit 1

- Backend: OpenTelemetry (traces e métricas) + Sentry (erros).
- Frota: heartbeat do player (status, versão, cache, rede) e proof-of-play em lote, idempotente por `event_id`, com fila local quando offline.
- Dashboards Grafana. A saúde da frota é feature de produto, não só de operação: o cliente vê a loja online ou offline.

---

## 3. Stack por camada

| Camada          | Escolha                                         | Observação                                       |
| --------------- | ----------------------------------------------- | ------------------------------------------------ |
| Backend API     | Node 22 + NestJS (Fastify)                      | Módulos por domínio, extração futura             |
| Contratos       | Zod + OpenAPI gerado                            | Pacote compartilhado no monorepo                 |
| Banco           | PostgreSQL 16 gerenciado + Drizzle              | RLS ativa, partições para eventos                |
| Filas e cache   | Redis + BullMQ                                  | Transcode, compilação de manifests, notificações |
| Storage e CDN   | Cloudflare R2 + CDN                             | Egress zero, URLs assinadas                      |
| Dashboard       | Next.js + Tailwind + shadcn/ui + TanStack Query | next-intl com ICU                                |
| Player          | Flutter: Android, depois Windows e web          | just_audio, SQLite (Drift)                       |
| Push (fase 2)   | MQTT (EMQX)                                     | Comandos e invalidação de manifest               |
| Telemetria      | Postgres particionado, ClickHouse na fase 2     | Grafana                                          |
| Auth            | Better Auth (organizações)                      | WorkOS para SSO na fase 2                        |
| Billing         | Stripe Billing + gateway local (Pix)            | Price list por mercado                           |
| IA              | AI Gateway interno com adapters                 | Claude API (texto), ElevenLabs ou Azure (TTS)    |
| Infra           | Docker, 1 região (São Paulo), GitHub Actions    | Railway ou Fly no MVP, ECS quando doer           |
| Observabilidade | OpenTelemetry, Sentry, Grafana                  | Desde o primeiro deploy                          |

---

## 4. Anatomia do player

| Componente     | Responsabilidade                                                 |
| -------------- | ---------------------------------------------------------------- |
| Sync agent     | Polling do manifest, validação de assinatura, aplicação atômica  |
| Rule engine    | Resolve o agendamento em horário local, mesmo offline            |
| Cache manager  | Download com verificação de hash, pin do essencial, LRU do resto |
| Audio engine   | Gapless, crossfade, ducking para locução sobre música            |
| Proof-of-play  | Log local de tudo que tocou, upload em lote quando há rede       |
| Watchdog + OTA | Auto-restart, atualização remota com rollback                    |
| Pairing        | Código na tela, claim no dashboard, token de dispositivo         |

Hardware alvo: um modelo de box Android homologado como referência, tablets como alternativa, web player como fallback de emergência. Homologar o box cedo: cada modelo de box barato tem firmware com surpresa própria.

---

## 5. Protocolo de sync v1

1. `GET /v1/devices/{id}/manifest` com `If-None-Match`. Resposta 304 na maioria dos ciclos.
2. Manifest: versão, janela compilada de 7 dias, lista de assets com hash e URL assinada, políticas (volume, horário de silêncio, ducking).
3. Player baixa apenas deltas, valida Ed25519, aplica de forma atômica (nunca fica em estado meio-aplicado).
4. `POST /v1/devices/{id}/events` em lote: playback, heartbeat, erro. Idempotente por `event_id`.
5. Intervalo 60 a 300s com jitter para não sincronizar a frota inteira no mesmo segundo.

---

## 6. Monorepo

```
senvori/
  apps/
    api/          NestJS
    dashboard/    Next.js
    player/       Flutter
    site/         Institucional
  packages/
    contracts/    Zod + OpenAPI
    i18n/         Chaves, pipeline TMS
    ui/           Design system (tokens, componentes)
    sdk/          Cliente TS da API pública
```

pnpm + Turborepo. O design system nasce em `packages/ui` com tokens desde o primeiro componente: é ele que sustenta o Princípio 10 (nível Stripe, Linear, Figma).

---

## 7. Fases

**Fase 0, fundação (2 a 3 semanas)**
Monorepo, CI, Docker, auth + tenancy com RLS, pipeline de i18n funcionando com 3 idiomas, tokens do design system, schema núcleo (tenant, país, unidade, dispositivo, conteúdo, licença).

**Fase 1, MVP (8 a 12 semanas)**
Biblioteca com upload e transcode, playlists, agendamento por unidade com timezone, player Android + web player, sync por polling, proof-of-play, dashboard de frota (online/offline), billing em BRL sobre schema multi-moeda.

**Fase 2, expansão**
Campanhas com múltiplas versões de idioma e distribuição automática, MQTT, ClickHouse para analytics, sementes do marketplace, SSO enterprise, segunda região de conteúdo, layout RTL.

**Não construir agora, de propósito**
Microservices, Kubernetes, multi-região ativa do plano de controle, GraphQL, app iOS do player, DRM pesado. Tudo isso tem porta aberta na arquitetura e custo zero enquanto não existe.

---

## 8. Segurança e compliance

- LGPD e GDPR by design: minimização de dados, DPA com clientes, audit log de ações administrativas desde o MVP.
- Residência de dados por região entra na fase 2, junto da segunda região de conteúdo.
- Segredos no vault do provedor, nunca em variável de ambiente commitada.
- Backups com point-in-time recovery testados, não só configurados.
- Manifests assinados e assets com hash: a cadeia loja-cloud é verificável de ponta a ponta.

---

## 9. Decisões em aberto

1. Modelo de box Android de referência para homologação.
2. Cloud definitiva (custo vs. região São Paulo vs. maturidade de serviços gerenciados).
3. TMS: Tolgee self-hosted vs. Crowdin.
4. Estrutura jurídica de cobrança por país, que trava o desenho fino do billing antes da primeira expansão.

---

## 10. Princípio guia

Tudo que é caro de reverter está travado neste documento: linguagem, banco, modelo multi-tenant, modelo de tempo, dinheiro em unidade mínima, licenciamento no schema, player offline-first, conteúdo por CDN. Todo o resto é feature, e feature se constrói quando o cliente aparece.
