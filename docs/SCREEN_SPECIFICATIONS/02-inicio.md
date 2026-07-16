# 02 · Início (Centro de Comando)

## 1. Objetivo

Responder, em 5 segundos, "está tudo bem com minha operação?" e apontar a próxima
ação. É a projeção priorizada de tudo (conteúdo, campanhas, programação, lojas, IA).

## 2. Persona & pergunta

Diretor de Marketing: "Como está minha operação agora, e o que precisa de mim?"

## 3. Rota & navegação

- Rota `/[locale]/inicio` (raiz autenticada, sem breadcrumb).
- Primeira tela após login.

## 4. Dados exibidos

- **Cartões de prioridade** (crítico→atenção→informação), cada um com o botão que resolve.
- **Faixa de KPIs** (ouvintes hoje, lojas no ar, campanhas no ar) com comparação.
- **Insight de IA** (quando houver): contexto + ação sugerida + descartar.
- **Atalhos rápidos** (Adicionar conteúdo, Nova campanha, Ver lojas).
- Fonte: agrega Tenancy (units), Catalog, Campaigns, Scheduling, Fleet via SDK.

## 5. KPIs / métricas

- "184k ouvintes hoje ▲ 8% vs. ontem" · "312 de 318 lojas no ar" · "5 campanhas no
  ar". Cada KPI: rótulo humano + comparação + micro-tendência opcional (sparkline).

## 6. Ações

- **Primária (contextual):** a ação do cartão de maior prioridade ("Ver 6 lojas
  offline", "Preencher programação", "Estender campanha").
- **Secundárias:** atalhos rápidos; descartar/adiar insight de IA.

## 7. Permissões

Cada cartão/KPI só aparece se o usuário tem leitura no domínio correspondente. Ação
sugerida só aparece se o usuário pode executá-la (senão, mostra só o diagnóstico).

## 8. Estados

- **Loading:** skeleton dos KPIs e cartões.
- **Vazio (empresa nova):** "Vamos preparar sua operação." + "Adicionar conteúdo" /
  "Convidar pessoa".
- **Tudo bem:** saudação "Tudo no ar." + KPIs verdes, sem cartão crítico.
- **Erro (área parcial fora):** o cartão daquela área mostra erro próprio; o resto segue.
- **Offline:** faixa de reconexão; KPIs mostram "atualizado há {tempo}".
- **Sem permissão global:** improvável (é a home); se sem nenhum domínio, mensagem
  orientando falar com o administrador.

## 9. Responsividade

KPIs: 1 col (mobile) → 3 (`md`+). Cartões empilham em mobile; grid em desktop.
Insight de IA full-width no topo.

## 10. Acessibilidade

Ordem de leitura: prioridade → KPIs → insight → atalhos. Severidade por cor **+**
ícone **+** texto. `aria-live="polite"` para atualizações de KPI. Cada cartão é uma
região nomeada.

## 11. Critérios de aceite

- [ ] Regra dos 5 segundos satisfeita (onde/o que houve/atenção/ação).
- [ ] Cartões ordenados por severidade, cada um com ação que resolve.
- [ ] KPIs sempre com comparação; nunca número solto.
- [ ] Insight de IA em tom de analista, com ação; descartável.
- [ ] Vazio útil para empresa nova.
- [ ] Estados de loading/erro/offline corretos; a11y AA.

## 12. Dependências

SDK de tenancy/catalog/campaigns/scheduling/fleet; componentes `StatMetric`,
`InsightCard`, `Alert`, `Card`. Campaigns/Scheduling/Fleet dependem de sprints
seguintes (degrada por área até lá).
