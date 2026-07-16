# Sprint 06 — Pre-Implementation Audit (Etapa 1 · §11)

> Mandated deliverable **before any table is created** (§11). Audits the real
> repository state, maps reusable entities, identifies gaps and risks, and sets
> the implementation plan. Evidence is from reading the actual schema/code on the
> trunk, not assumptions. Date: 2026-07-16.

## 1. Estado atual (git / plataforma)

- **Trunk canônico:** `claude/senvori-core-domains-w10xi8` (não há `main`; ver §4 e
  `docs/CONSOLIDATION.md`). Contém **integralmente a Sprint 05B** (consolidação +
  production readiness) — commits `cc36450`, `63d5f51`, `901d4b4`.
- **Commit-base desta sprint:** `901d4b4`.
- **CI:** verde no trunk (run #8, verify + docker). Working tree limpo.
- **Branch da sprint:** por política desta sessão o trabalho continua no branch
  designado `claude/senvori-core-domains-w10xi8` (que É o trunk consolidado). O
  nome sugerido `claude/senvori-media-execution-foundation` fica registrado como
  passo de promoção quando `main`/política de branch existir (mesmo tratamento de
  05A/05B). Nenhum histórico paralelo é criado.

## 2. Domínios existentes (o que já há no schema)

**Descoberta central:** o schema já modela quase todo o domínio de programação. As
tabelas foram criadas no scaffold "14 domains" (`1157300`) mas os **módulos estão
vazios** (só `*.module.ts`) — schema sem serviço/contrato. Portanto Sprint 06 é
majoritariamente **reaproveitamento + compilador novo**, não um domínio novo.

### 2.1 `playlists` (schema `apps/api/src/database/schema/playlists.ts`)

| Tabela                 | Colunas relevantes                                                                                                       | Papel para Sprint 06                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `playlists`            | type (manual/smart/generated), name, description, status (draft/published/archived), ownerId, targetEnergy, imageAssetId | **Program / Content Collection**                 |
| `playlist_items`       | playlistId, assetId, position (unique por playlist)                                                                      | **Itens fixos da coleção**                       |
| `smart_rules`          | criteria jsonb, targetDurationMs, ordering (weighted_shuffle/energy_asc/energy_desc)                                     | **Coleção dinâmica (fonte por critério)**        |
| `rotation_policies`    | minTrackGapMinutes (180), minArtistGapMinutes (45), maxPlaysPerDay (1 por tenant)                                        | **Regras de repetição de faixa/artista (§13)**   |
| `packs` / `pack_items` | coleção de playlists                                                                                                     | Agrupamento (marketplace) — fora do foco         |
| `playlist_versions`    | version, resolvedItems jsonb, context jsonb, resolvedAt (unique playlist+version)                                        | **Program Version / snapshot imutável do plano** |

### 2.2 `scheduling` (schema `.../scheduling.ts`)

| Tabela             | Colunas relevantes                                                                                              | Papel                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `schedules`        | targetType (tenant/country/brand/group/unit/zone), targetId, status, validFrom/Until                            | **Assignment (programação → escopo)**       |
| `schedule_entries` | contentType (playlist/pack/campaign_ref/silence), contentId, rrule, start/endTimeLocal, layer, priority, config | Slots temporais (RRULE)                     |
| `silence_policies` | rrule, janela local, behavior                                                                                   | Silêncio/quiet hours                        |
| `manifests`        | device, version, timeline, assets, signature                                                                    | **FORA DE ESCOPO (§29 — manifesto/Player)** |
| `compilation_jobs` | scope, reason, status                                                                                           | Fila de compilação (uso futuro/incremental) |

### 2.3 `catalog` (schema `.../catalog.ts`) — insumo do compilador

| Tabela   | Colunas                                       | Uso no compilador                                    |
| -------- | --------------------------------------------- | ---------------------------------------------------- |
| `assets` | id, title, durationMs, type, status           | id/duração/status (elegibilidade)                    |
| `tracks` | assetId, artist (indexado), bpm, energy (1–5) | **artist p/ janela de artista**; bpm/energy (futuro) |

### 2.4 RBAC (`packages/contracts/src/rbac/permissions.ts`)

- Convenção `domain:resource:action`, deny-by-default, `∧ scope`.
- **`playlists:*` e `scheduling:*` já são concedidos** a `admin`, `manager`,
  `curator` (playlists), etc. → basta **adicionar as strings concretas** ao array
  `PERMISSIONS`; os papéis já cobrem.

## 3. Entidades reaproveitáveis × redundantes

| Conceito Sprint 06 (§12)      | Reaproveitar                                                                         | Nova?                        |
| ----------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| Media Asset                   | `catalog.assets` / `tracks`                                                          | Não                          |
| Playlist / Content Collection | `playlists` + `playlist_items` + `smart_rules`                                       | Não                          |
| Program (config declarativa)  | `playlists` (type manual/smart) como o "Program" audio-first                         | Não (evita duplicar)         |
| Program Version (imutável)    | `playlist_versions` (resolvedItems + context + version)                              | Não                          |
| Rotation / repetição          | `rotation_policies`                                                                  | Não                          |
| Assignment (→ escopo)         | `schedules` (targetType/targetId)                                                    | Não                          |
| Compilation Context           | **efêmero, não persistido** (tipo em código)                                         | Só tipo                      |
| Execution Plan (preview)      | **efêmero** no preview; persistido = `playlist_versions.resolvedItems` na publicação | Só tipo p/ preview           |
| Execution Item                | item dentro de `resolvedItems`                                                       | Não                          |
| Compiler                      | **NOVO serviço puro**                                                                | **Sim (código, não tabela)** |
| Eligibility / Fallback policy | **interfaces novas em código**                                                       | Só código                    |

**Conclusão:** nenhuma tabela nova é estritamente necessária. Possível **migration
aditiva mínima** (não destrutiva): acrescentar a `playlist_versions` colunas
`plan_hash text` e `compiler_version text` para tornar determinismo/auditoria
consultáveis por SQL (hoje caberiam em `context` jsonb; coluna dedicada é melhor p/
índice/auditoria). Decisão registrada em ADR-06 (persistência do plano).

## 4. Lacunas (o que falta construir)

1. **Compilador determinístico** (§17) — puro, tipado, seedado, timezone-aware,
   regras de repetição, fallback, hash, warnings, teto de iterações. **Não existe.**
2. **Contracts Zod** para playlists/programming + preview (`domains/playlists.ts`).
3. **API**: playlists CRUD, itens, `smart_rules`, `rotation_policies`, publicar
   versão (`playlist_versions`), assignment (`schedules`), **preview** (efêmero).
4. **Permissões concretas**: `playlists:*`, `scheduling:preview`, etc.
5. **SDK**: métodos tipados de programming + preview.
6. **Dashboard "Programação"**: lista, criação/edição, detalhe, **Prévia do dia**.
7. **i18n** (pt-BR/en-US/es-ES) + **a11y** + estados.
8. **Testes**: unit do compilador (determinismo/timezone/DST/fallback), integração
   (RLS/RBAC/audit/imutabilidade/preview), migração (limpo + pós-05B).
9. **Docs/ADRs** (§28): MEDIA_EXECUTION_ARCHITECTURE, PROGRAMMING_COMPILER,
   PROGRAMMING_DOMAIN, 7 ADRs.

## 5. Riscos

| Risco                                                      | Severidade | Mitigação                                                            |
| ---------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| Duplicar domínio (criar "programs" paralelo a "playlists") | Alta       | **Reusar `playlists`**; sem tabela nova (este audit)                 |
| Confundir Plan × Manifest × Session                        | Alta       | Manifesto/Player **fora de escopo** (§29); separação em ADR-04       |
| Preview persistir milhões de itens                         | Média      | Preview **efêmero**; só publica versão (ADR-06)                      |
| Timezone/DST incorreto                                     | Alta       | IANA + testes DST (America/Sao_Paulo, New_York, Europe/Madrid)       |
| Não-determinismo (Date.now/Math.random)                    | Alta       | Seed derivada; compilador **puro**, sem relógio/aleatório            |
| Vazamento cross-tenant no preview                          | Alta       | tenant do contexto autenticado, nunca do cliente; RLS                |
| Escopo gigante numa sprint                                 | Alta       | Fasear (plano §6); DoD por incremento; nada "pronto" sem verificação |

## 6. Plano de implementação (faseado, ordem do §7)

1. **F1 — Fundação documental (este incremento):** audit (este doc) + conceptual
   model + ADRs. _Sem código de tabela._
2. **F2 — Compilador puro + testes unitários** (Etapa 7/17/25): o "cérebro",
   isolado de NestJS/DB, com determinismo/timezone/fallback/hash. Verificável sozinho.
3. **F3 — Migração aditiva mínima** (`plan_hash`, `compiler_version` em
   `playlist_versions`) + contracts Zod + permissões.
4. **F4 — API + RLS/RBAC/auditoria** (CRUD/itens/regras/publicar/assignment/preview).
5. **F5 — SDK** tipado.
6. **F6 — Dashboard "Programação"** (telas + estados + i18n + a11y).
7. **F7 — Testes de integração + migração + segurança + docs finais + relatório.**

Cada fase entra com typecheck/lint/test/build verdes e é commitada. Nada é declarado
pronto sem verificação (DoD §32).

## 7. Divergências doc × schema registradas

- A Product Spec (05A) fala de "Programação" com foco de UX; o schema real usa
  `playlists` (audio) + `schedules` (RRULE/scope). **Alinhamento:** a UI usa
  linguagem de produto ("Programação/Prévia do dia"); o backend reusa
  `playlists`/`playlist_versions` (audio-first). Sem conflito fundador.
- `manifests`/`compilation_jobs` existem no schema mas pertencem a Player/Fleet
  (Sprints 08–10) — **não tocados** nesta sprint.

**Gate cumprido:** auditoria concluída; decisões de reuso tomadas; **nenhuma tabela
nova criada antes deste relatório.** Segue Etapa 2 (modelo conceitual + ADRs).
