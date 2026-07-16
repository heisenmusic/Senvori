# 12 · Equipe

## 1. Objetivo

Deixar claro **quem pode fazer o quê** e permitir convidar, ajustar papéis e
escopos com segurança (deny-by-default, sem conceder além do próprio alcance).

## 2. Persona & pergunta

Diretor de Marketing: "Quem tem acesso, com qual papel, em quais lojas/marcas?"

## 3. Rota & navegação

- Rota `/[locale]/equipe`. Nav primária #6.
- Convidar: painel/rota `/[locale]/equipe/convidar`.

## 4. Dados exibidos

- **Lista de pessoas:** nome, e-mail, papel, escopo (empresa/marca/grupo/loja),
  status (Ativo/Convite pendente/Suspenso), último acesso.
- Filtros (papel/status/escopo); busca.
- Fonte: Identity via SDK (`identity:member:read`).

## 5. KPIs / métricas

Contagem por papel/status opcional ("12 ativos · 2 convites pendentes").

## 6. Ações

- **Primária:** "Convidar pessoa" (`identity:member:invite`).
- **Secundárias:** alterar papel/escopo, reenviar convite, suspender, remover.

## 7. Permissões

- Ver: `identity:member:read`. Convidar/alterar/remover: permissões correspondentes.
- **Guarda:** não delega além do próprio escopo; protege o último administrador;
  rebaixar-se a si mesmo exige confirmação.

## 8. Estados

- **Loading:** skeleton da lista.
- **Vazio:** "Convide sua equipe para colaborar." + "Convidar pessoa".
- **Sem resultado:** "Nada encontrado…" + limpar filtros.
- **Convite pendente/expirado:** ação "Reenviar convite".
- **Remover/rebaixar:** confirma ("perde acesso na hora").
- **Sem permissão:** lista em leitura; ações ocultas.
- **Erro/Offline:** padrão global.

## 9. Responsividade

Tabela em desktop (comparar papéis/escopos); colapsa em cartões rótulo→valor em mobile.

## 10. Acessibilidade

Tabela semântica com `th scope` e `aria-sort`; papéis por texto (não só cor);
confirmação de remover com foco no seguro; ordenação por privilégio explicada.

## 11. Critérios de aceite

- [ ] Ordem por papel (mais privilegiado primeiro), depois nome.
- [ ] Convidar define papel + escopo dentro do que o usuário pode delegar.
- [ ] Remover/rebaixar confirmam; último administrador protegido.
- [ ] Convite pendente permite reenviar; status claros.
- [ ] a11y AA; linguagem de produto (papel, não "role/RBAC").

## 12. Dependências

Identity API (pronto), `Table`, `Dialog`, filtros, convite por e-mail. Regras de
escopo em PRODUCT_RULES §12.
