# Implementation Roadmap — Ordem de Construção

> A sequência de construção da Senvori em 4 fases. Cada fase: **objetivo,
> dependências, critérios de aceite, riscos.** A ordem respeita o fluxo de valor
> (Conteúdo → Campanhas → Programação → Lojas) e a prontidão de backend
> (ver PRODUCT_MAP §1). Congelado; mudanças via PRODUCT_DECISION_LOG.

## Estado atual (fundação já construída)

- ✅ Identity + Tenancy runtime (RLS FORCE, RBAC, auditoria transacional, sessão).
- ✅ Catalog & Media (storage abstrato local+R2, upload→confirm→process, worker).
- ✅ SDK/contracts tipados; dashboard com login, unidades protegidas e Biblioteca.
- ✅ 62 testes de integração contra Postgres real; CI.

---

## Fase 1 — O núcleo operacional

**Objetivo:** o Diretor de Marketing entra, entende a operação e coloca conteúdo no
ar via campanha e programação.

**Escopo (telas):** Início (02), Biblioteca (03), Adicionar conteúdo (04), Conteúdo
detalhe (05), Campanhas (06), Assistente de campanha (07), Campanha detalhe (08),
Programação (09).

**Backend a construir nesta fase:** Campaigns (CRUD, publicação, estados) e
Scheduling/Playlists (regras, resolução, som base, conflitos), seguindo o mesmo
padrão de RLS/RBAC/auditoria das sprints anteriores.

**Dependências:** Catalog (pronto), Tenancy units (pronto), Identity (pronto).

**Critérios de aceite:**

- [ ] Fluxo ponta a ponta: adicionar conteúdo → criar campanha → publicar → ver na
      programação, tudo em linguagem de produto.
- [ ] Início responde a regra dos 5 segundos com dados reais.
- [ ] Nenhuma loja fica muda (som base garantido na programação).
- [ ] Cada tela passa o PRODUCT_QA_CHECKLIST (A–J).

**Riscos:** resolução de conflitos de programação (complexidade de regras);
performance da agregação do Início; consistência de estados de campanha.
Mitigação: contratos Zod primeiro; testes de integração por regra.

---

## Fase 2 — A rede visível e governada

**Objetivo:** enxergar cada loja viva e governar quem faz o quê.

**Escopo (telas):** Lojas lista (10), Loja detalhe (11), Equipe (12),
Configurações (13).

**Backend a construir:** Fleet (dispositivos, sincronização/heartbeat, status
no ar/offline/alerta); completar Tenancy settings (marcas, idiomas, som base padrão).
Identity já suporta convites/papéis/escopos.

**Dependências:** Fase 1 (campanhas/programação alimentam "loja viva"),
Identity/Tenancy (prontos/parciais).

**Critérios de aceite:**

- [ ] Loja mostra tocando agora/status/sync; offline explica que segue tocando o baixado.
- [ ] Equipe convida/ajusta papel/escopo respeitando deny-by-default e último admin.
- [ ] Configurações salva com undo; mudança estrutural confirma alcance.
- [ ] QA (A–J) por tela.

**Riscos:** confiabilidade de heartbeat/sincronização; volume de lojas (paginação/
agrupamento de alertas). Mitigação: agrupar alertas; virtualizar listas grandes.

---

## Fase 3 — Inteligência de resultado e monetização

**Objetivo:** provar impacto e abrir novas fontes de valor.

**Escopo:** Analytics (desempenho de campanhas/ouvintes/lojas), Retail Media
(inventário/veiculação paga), Fleet avançado, Marketplace (conteúdo/serviços).

**Dependências:** Fases 1–2 (dados de veiculação e lojas como base das métricas).

**Critérios de aceite:**

- [ ] Métricas sempre com significado (rótulo + comparação), nunca número solto.
- [ ] Prova de veiculação confiável alimenta Analytics e Retail Media.
- [ ] Telas 3–4 especificadas em SCREEN_SPECIFICATIONS antes de codar.

**Riscos:** exatidão de dados de veiculação; privacidade/consentimento; escala de
Analytics. Mitigação: definir fonte de verdade de veiculação na Fase 1.

---

## Fase 4 — A camada de inteligência

**Objetivo:** a IA como analista sênior transversal — antecipa, sugere, explica.

**Escopo:** Insights proativos (feriados/lacunas/anomalias), Copilot no fluxo,
Automações (regras que a IA propõe e o humano aprova).

**Dependências:** dados das Fases 1–3 (quanto mais sinal, melhor a IA).

**Critérios de aceite:**

- [ ] IA aparece **onde a decisão acontece** (Início/Campanha/Programação/Loja),
      nunca numa aba isolada.
- [ ] Sempre contexto + sugestão acionável + explicação; nunca executa irreversível
      sem confirmação (PRODUCT_PHILOSOPHY §2).
- [ ] Toda sugestão é opcional e descartável.

**Riscos:** confiança/explicabilidade; ação autônoma indevida. Mitigação: humano no
laço para qualquer efeito de alcance; log de decisões da IA.

---

## Princípios de sequenciamento

1. **Valor antes de sofisticação:** primeiro colocar conteúdo no ar (Fase 1).
2. **Backend segue o mesmo padrão** de segurança/auditoria já provado.
3. **Nenhuma tela sem spec** antes de implementar.
4. **Cada fase entrega algo usável** pelo Diretor de Marketing, não um pedaço técnico.
