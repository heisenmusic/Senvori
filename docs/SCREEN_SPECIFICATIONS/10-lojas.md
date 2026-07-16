# 10 · Lojas (lista)

## 1. Objetivo

Mostrar, num olhar, se cada loja está no ar e tocando a coisa certa — priorizando
o que tem problema. Nunca uma tabela cinza.

## 2. Persona & pergunta

Diretor de Marketing: "Todas as minhas lojas estão no ar e certas? Onde há problema?"

## 3. Rota & navegação

- Rota `/[locale]/lojas`. Nav primária #5.
- Loja: `/[locale]/lojas/[id]` — breadcrumb `Lojas › {loja}`.

## 4. Dados exibidos

- **Cards/pontos de loja:** nome, status (No ar/Offline/Alerta), tocando agora,
  última sincronização, campanhas ativas, região/marca/grupo.
- Alternância mapa/lista; busca; filtros (status/região/marca/grupo).
- Fonte: Tenancy (units) + Fleet (dispositivos/sync) via SDK.

## 5. KPIs / métricas

"312 de 318 no ar" · "6 offline há +1h" (agrupado, não 6 ruídos).

## 6. Ações

- **Primária (contextual):** "Ver lojas offline" / resolver alerta.
- **Secundárias:** buscar, filtrar, abrir loja (tela 11), ações de dispositivo
  (conforme permissão/escopo).

## 7. Permissões

`tenancy:unit:read` para ver; ações de dispositivo com permissão de escopo. Escopo
filtra quais lojas aparecem.

## 8. Estados

- **Loading:** skeleton de cards/mapa.
- **Vazio:** "Nenhuma loja cadastrada ainda." (orienta conforme papel).
- **Sem resultado:** "Nada encontrado…" + limpar filtros.
- **Ordem padrão:** problema (offline/alerta) primeiro.
- **Offline (dispositivo):** card mostra "sem conexão há {tempo}; segue tocando o
  baixado".
- **Muitas offline:** agrupa em um alerta único.
- **Erro/Offline (app):** padrão global.

## 9. Responsividade

Grid de cards 1→2→3→4; mapa vira lista em mobile; filtros em drawer.

## 10. Acessibilidade

Status por cor+ícone+texto; mapa tem equivalente em lista; cards nomeados; alertas
agrupados anunciados uma vez.

## 11. Critérios de aceite

- [ ] Ordem problema→no ar (nunca alfabética).
- [ ] Loja offline explica que segue tocando o baixado.
- [ ] Muitas offline agrupam em alerta único.
- [ ] Mapa tem equivalente acessível em lista.
- [ ] Filtros com chips; vazio/sem-resultado úteis; a11y AA.

## 12. Dependências

Tenancy units (pronto), Fleet (próxima sprint), `StoreCard`, mapa acessível,
`Alert`, filtros. Tela 11 (detalhe).
