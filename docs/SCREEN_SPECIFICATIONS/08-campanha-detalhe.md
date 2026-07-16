# 08 · Campanha :id (detalhe / prova)

## 1. Objetivo

Provar que a campanha está acontecendo (onde toca, veiculação, desempenho) e
permitir ajustar, pausar ou encerrar com plena consciência do alcance.

## 2. Persona & pergunta

Diretor de Marketing: "Esta campanha está no ar, funcionando, e valeu a pena?"

## 3. Rota & navegação

- Rota `/[locale]/campanhas/[id]`. Breadcrumb: `Campanhas › {nome}`.

## 4. Dados exibidos

- **Resumo** (objetivo, período, status, conteúdo).
- **Onde está tocando** (lojas/regiões, mapa/lista, quantas no ar).
- **Prova de veiculação** (quando/onde tocou; sincronização por loja).
- **Desempenho** (ouvintes/alcance/tendência quando disponível).
- Fonte: Campaigns + Fleet + Scheduling via SDK.

## 5. KPIs / métricas

Alcance ("412 lojas · 380 no ar"), veiculações, desempenho vs. média/período.

## 6. Ações

- **Primária (contextual):** "Editar" (rascunho/agendada) ou "Encerrar" (no ar).
- **Secundárias:** "Pausar" (undo curto), "Duplicar", exportar prova.

## 7. Permissões

`campaign:read` para ver; `campaign:update`/`campaign:manage` para editar/pausar/
encerrar, dentro do escopo.

## 8. Estados

- **Loading:** skeleton de seções.
- **No ar:** mostra prova viva; ações Pausar/Encerrar.
- **Agendada:** contagem para início; Editar disponível.
- **Encerrada:** só leitura + desempenho final + "Duplicar".
- **Publicação pendente (lojas offline):** "N lojas recebem ao reconectar".
- **Erro/Offline:** padrão global.

## 9. Responsividade

Resumo no topo; seções empilham em mobile; colunas em desktop. Mapa colapsa em lista
em telas estreitas.

## 10. Acessibilidade

Abas/seções nomeadas; status por cor+texto; prova em tabela semântica; confirmação
de encerrar com alcance e foco no seguro.

## 11. Critérios de aceite

- [ ] Mostra onde toca + prova de veiculação + desempenho.
- [ ] Pausar tem undo; encerrar confirma com alcance ("para em N lojas").
- [ ] Publicação pendente em lojas offline é explicada.
- [ ] Encerrada é só leitura com desempenho final.
- [ ] a11y AA; linguagem de produto.

## 12. Dependências

Campaigns + Fleet + Scheduling APIs (próximas sprints), `Tabs`, `ScheduleGrid`/mapa,
`Dialog`, `Table`. Tela 07 (origem).
