# Media Execution Architecture (Sprint 06 · Etapa 2)

> O modelo conceitual canônico da execução de mídia da Senvori e seus limites.
> **Audio-first.** Este documento precede o código (§7). Fonte de verdade dos
> conceitos; nomes finais respeitam o schema já existente (ver
> `docs/sprint-06/PRE_IMPLEMENTATION_AUDIT.md`).

## 1. O que estamos construindo (e o que não)

Estamos construindo o **cérebro que decide o que tocará** — não um player, não uma
fila, não um AutoDJ, não uma rádio. A missão desta sprint é o caminho:

```
Configuração declarativa → compilação determinística → plano de execução → prévia
```

**Fora de escopo (§29):** manifesto assinado, distribuição, Player, Fleet,
proof-of-play, campanhas, retail media, vídeo/signage. As tabelas `manifests` e
`compilation_jobs` existem no schema mas pertencem às Sprints 08–10 e **não são
tocadas**.

## 2. Vocabulário canônico (conceito → entidade real)

| Conceito                                | Entidade / forma                                                                               | Persistência                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Media Asset**                         | `catalog.assets` (+ `tracks`: artist/bpm/energy)                                               | existente                                                                  |
| **Content Collection / Program**        | `playlists` (`type` manual/smart) + `playlist_items` + `smart_rules`                           | existente                                                                  |
| **Program Version** (snapshot imutável) | `playlist_versions` (`version`, `resolvedItems`, `context`, + `plan_hash`, `compiler_version`) | existente + migração aditiva                                               |
| **Assignment** (programa → escopo)      | `schedules` (`targetType`/`targetId`)                                                          | existente                                                                  |
| **Rotation rules**                      | `rotation_policies` (track/artist gap)                                                         | existente                                                                  |
| **Compilation Context**                 | tipo em código (tenant, unit, timezone, localDate, seed, compilerVersion, elegíveis)           | **efêmero** (não persistido)                                               |
| **Execution Plan**                      | saída do compilador (itens, início/fim, duração, hash, warnings)                               | **efêmero no preview**; persistido só ao publicar (em `playlist_versions`) |
| **Execution Item**                      | item ordenado do plano (assetId, início, duração, fonte, motivo)                               | dentro do plano                                                            |
| **Compiler**                            | serviço **puro** novo                                                                          | código                                                                     |
| **Eligibility Policy**                  | interface (status do asset + gancho de licensing)                                              | código                                                                     |
| **Fallback Policy**                     | interface/estratégia                                                                           | código                                                                     |

Na **interface**, linguagem de negócio (§6): "Gerar programação", "Prévia do dia",
"Variação diária", "Regra incompatível", "Conteúdo de segurança", "Versão da
programação". Termos internos (seed, hash, compiler, plan) **nunca** aparecem na UI.

## 3. Boundaries (separação de responsabilidades, §9.4)

```
Configuração  ─────────►  Compilação  ─────────►  Plano de execução  ─────────►  Prévia
(o que o usuário          (função pura,            (resultado determinístico,     (visualização
 quer: playlists,          sem DB/HTTP,             ordenado, com hash,            em linguagem
 rules, assignment)        timezone-aware)          warnings, fallback)            de negócio)

                              ┌── FORA DE ESCOPO ──┐
Plano  ─X─►  Manifesto (assinado, por device)  ─X─►  Sessão de reprodução (Player)
```

- **Configuração** vive no banco (playlists/rules/schedules) sob RLS/RBAC.
- **Compilação** é uma função pura: `(context, catálogo, rules, seed) → plano`. Não
  acessa o banco durante o algoritmo; recebe candidatos já carregados.
- **Plano** é o resultado. No **preview** é efêmero; na **publicação** vira uma
  `playlist_version` imutável.
- **Manifesto** e **Sessão** são artefatos futuros — a arquitetura não os impede
  (o plano é versionável/hashável/assinável depois), mas não os implementa.

## 4. Fluxo determinístico (§5)

```
Intenção do cliente
  → Catálogo elegível (assets ready + política de elegibilidade)
  → Regras (rotation_policies + smart_rules)
  → Contexto da unidade (timezone IANA, país)
  → Data local + seed derivada
  → Compilador (puro)
  → Plano de execução (itens, duração, hash, warnings)
  → Prévia compreensível
```

**Determinismo (§9.2):** mesma `(programVersion, catálogoElegível, unit/syncGroup,
localDate, timezone, rules, compilerVersion, seed)` ⇒ **mesmo plano** (mesmo hash).
Sem `Date.now()`/`Math.random()` no algoritmo. A seed deriva de
`hash(tenant + programVersion + syncGroup + localDate + compilerVersion)` (§14).

## 5. Trade-offs e alternativas descartadas

- **Reusar `playlists` vs. criar domínio `programs`:** escolhido **reusar** — evita
  duplicação (§10), o schema já cobre coleção/itens/rules/versão. Descartado: novo
  domínio paralelo (duplicaria e divergiria).
- **Persistir todo preview vs. efêmero:** escolhido **efêmero**; persiste só ao
  publicar. Descartado: materializar milhões de itens/dia (§16, §9.2).
- **Motor de regras genérico/DSL vs. regras essenciais em código:** escolhido
  **regras essenciais** (repetição/peso/fallback) tipadas em código. Descartado:
  DSL/engine arbitrário (§10 overengineering).
- **RRULE runtime agora vs. depois:** o `schedule_entries.rrule` existe, mas a
  resolução temporal completa (dayparts/RRULE→timeline) é de Scheduling Runtime
  (Sprint 07). Sprint 06 compila **um período/janela** para a prévia.

## 6. Extensibilidade preservada (sem construir agora)

- **Canal:** discriminador só quando necessário; áudio é o único implementado.
  Vídeo/signage não viram abstração universal prematura (§0, §9.5).
- **Sync modes** (Soft/Hard/Independent, §14): documentados; padrão preparado para
  **Soft Sync** (mesma base, tolera diferença local). Runtime não implementado.
- **Camadas de prioridade** (emergência→evento→campanha→local→música→fallback,
  §15): o modelo de plano não impede camadas futuras; só a música-base é compilada.
- **Offline-first** (§9.6): o plano é versionável e hashável → futuramente
  assinável/baixável/verificável/reconciliável sem redesenho.

---

# ADRs (§28)

Decisões arquiteturais desta sprint. Formato: contexto · decisão · consequências ·
alternativas descartadas.

### ADR-06-01 — Programação declarativa

- **Contexto:** o usuário não deve montar cada segundo do dia manualmente.
- **Decisão:** o usuário **declara** fontes de conteúdo, regras e escopo; a Senvori
  compila. Configuração ≠ resultado.
- **Consequências:** UX simples; compilador carrega a complexidade; previews baratos.
- **Descartado:** edição manual item-a-item da grade diária.

### ADR-06-02 — Compilação determinística

- **Contexto:** auditoria, preview reproduzível, futura operação offline/sync.
- **Decisão:** compilador **puro** e determinístico; seed derivada; sem relógio/aleatório.
- **Consequências:** mesma entrada ⇒ mesmo plano (mesmo hash); testável sem HTTP/DB.
- **Descartado:** shuffle não determinístico; acesso a `Date.now()` no algoritmo.

### ADR-06-03 — Versões publicadas imutáveis

- **Contexto:** precisa responder "qual versão estava ativa, quando, por quem, com
  quais regras/catálogo/compilador".
- **Decisão:** publicar cria uma `playlist_version` **imutável**; alterações geram
  nova versão. Imutabilidade por regra de aplicação + testes (e constraint onde viável).
- **Consequências:** histórico confiável; rollback = republicar/apontar versão.
- **Descartado:** editar versão publicada in-place.

### ADR-06-04 — Separação Plano / Manifesto / Sessão

- **Contexto:** risco de acoplar decisão, distribuição e reprodução.
- **Decisão:** Sprint 06 entrega **Configuração → Compilação → Plano → Prévia**.
  Manifesto (assinado/por device) e Sessão (Player) ficam fora, com fronteira clara.
- **Consequências:** núcleo evolui sem Player/Fleet; futuros módulos consomem o plano.
- **Descartado:** gerar manifesto/entregar ao device nesta sprint.

### ADR-06-05 — Implementação audio-first

- **Contexto:** não fabricar abstração universal de mídia (§0/§9.5).
- **Decisão:** implementar **áudio**; prever discriminador de canal só quando
  necessário; sem timeline visual/cenas/vídeo.
- **Consequências:** simplicidade real hoje; extensível depois sem redesenho universal.
- **Descartado:** modelo genérico de qualquer mídia.

### ADR-06-06 — Estratégia de persistência do plano

- **Contexto:** não persistir cada item de cada dia para todas as unidades por anos (§16).
- **Decisão:** **preview efêmero** (sob demanda); ao **publicar**, persiste a versão
  imutável em `playlist_versions` (`resolvedItems` + `context`) e adiciona colunas
  aditivas `plan_hash` + `compiler_version` para auditoria/consulta. Object storage
  fica para o futuro.
- **Consequências:** volume proporcional ao estágio; determinismo consultável.
- **Descartado:** materializar previews; criar tabelas de plano por dia/unidade.

### ADR-06-07 — Tratamento de catálogo insuficiente

- **Contexto:** poucas faixas, tudo bloqueado, playlist vazia, regras impossíveis (§13).
- **Decisão:** (1) tentar cumprir todas as regras; (2) relaxar **apenas** regras
  marcadas como relaxáveis, registrando qual; (3) usar fallback autorizado
  ("conteúdo de segurança"); (4) **teto de iterações** (nunca loop infinito);
  (5) retornar **warning** compreensível. O plano nunca falha silenciosamente.
- **Consequências:** resultado previsível e explicável; UX honesta ("algumas regras
  foram flexibilizadas").
- **Descartado:** falhar sem plano; loop até preencher; relaxar regras não-relaxáveis.
