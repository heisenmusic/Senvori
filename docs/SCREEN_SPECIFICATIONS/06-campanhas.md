# 06 · Campanhas (lista)

## 1. Objetivo

Mostrar o que a marca comunica e quando, priorizando o que está no ar, e abrir o
caminho para criar/gerir campanhas como decisões de negócio.

## 2. Persona & pergunta

Diretor de Marketing: "O que estou comunicando agora, e o que vem?"

## 3. Rota & navegação

- Rota `/[locale]/campanhas`. Nav primária #3. Sem breadcrumb (raiz).

## 4. Dados exibidos

- **Cards de campanha:** nome, status, período, alcance (lojas/região), conteúdo
  principal, desempenho resumido quando encerrada/no ar.
- Busca, filtros (status/período/lojas-região), contagem.
- Fonte: Campaigns via SDK (`campaign:read`) — backend na próxima sprint.

## 5. KPIs / métricas

Resumo opcional ("5 no ar · 2 agendadas"). Desempenho por card quando disponível.

## 6. Ações

- **Primária:** "Nova campanha" (`campaign:create`) → assistente (tela 07).
- **Secundárias:** buscar, filtrar, abrir campanha (tela 08), pausar/encerrar
  (na lista, com confirmação de alcance).

## 7. Permissões

- Sem `campaign:read` → destino oculto.
- Criar/pausar/encerrar conforme permissão e escopo; senão ocultas.

## 8. Estados

- **Loading:** skeleton de cards.
- **Vazio:** "Nenhuma campanha ainda." + "Nova campanha".
- **Sem resultado de busca:** "Nada encontrado…" + limpar filtros.
- **Erro/Offline:** padrão global (retry / cards em cache + escrita bloqueada).

## 9. Responsividade

Grid 1→2→3 colunas; ordem no ar→agendada→rascunho→encerrada preservada em todos os tamanhos.

## 10. Acessibilidade

Status por badge (cor+texto); card nomeado pelo nome da campanha; ações com nome
acessível; ordenação por prioridade explicada.

## 11. Critérios de aceite

- [ ] Ordem no ar→agendada→rascunho→encerrada.
- [ ] "Nova campanha" abre o assistente.
- [ ] Pausar/encerrar na lista confirmam com alcance.
- [ ] Vazio e sem-resultado úteis; filtros com chips.
- [ ] a11y AA; linguagem de produto.

## 12. Dependências

Campaigns API (próxima sprint), `CampaignCard`, `Badge`, `EmptyState`. Até o backend
existir, tela em estado "em breve" ou mock desabilitado conforme roadmap.
