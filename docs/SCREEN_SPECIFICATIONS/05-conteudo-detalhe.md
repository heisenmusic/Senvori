# 05 · Conteúdo :id (detalhe)

## 1. Objetivo

Ver e editar tudo sobre um conteúdo (metadados, versões, uso, direitos) e decidir
o que fazer com ele (usar, substituir, arquivar), sempre em linguagem de marca.

## 2. Persona & pergunta

Diretor de Marketing: "O que é este conteúdo, onde ele é usado, e está pronto/certo?"

## 3. Rota & navegação

- Rota `/[locale]/biblioteca/[id]`.
- Breadcrumb: `Biblioteca › {título}`. Chega-se pelo card na tela 03.

## 4. Dados exibidos

- Capa, título, artista/origem, categoria, idioma, duração, status, campanha
  vinculada, direitos declarados, uso (em quais campanhas/lojas), popularidade,
  versões, prévia de áudio (player rotulado).
- Fonte: Catalog via SDK (`catalog:asset:read`).

## 5. KPIs / métricas

Uso ("em 4 campanhas · 212 lojas") e popularidade (relativo), com significado.

## 6. Ações

- **Primária:** "Salvar" (aparece com mudança; salva com undo).
- **Secundárias:** "Substituir arquivo", "Arquivar", "Adicionar a campanha",
  tocar prévia, ver versões.

## 7. Permissões

- Leitura: `catalog:asset:read`. Editar metadado: `catalog:asset:update`.
- Substituir/arquivar: permissões correspondentes; senão ocultas.

## 8. Estados

- **Loading:** skeleton do cabeçalho + campos.
- **Preparando:** "Estamos preparando este conteúdo. Fica pronto em instantes."
  (edição de metadado permitida; substituir arquivo bloqueado).
- **Falhou:** "Não conseguimos preparar este conteúdo." + reenviar.
- **Erro/Não encontrado:** "Não encontramos este conteúdo. Ele pode ter sido arquivado."
- **Sem permissão:** campos em leitura; ações de escrita ocultas.
- **Concorrência:** "Alguém atualizou isto enquanto você editava." + ver versão nova.
- **Sucesso:** "Alterações salvas." (undo).

## 9. Responsividade

Uma coluna em mobile (capa/player no topo, campos abaixo); duas colunas em desktop
(mídia à esquerda, metadados à direita).

## 10. Acessibilidade

Player com controles rotulados e estado anunciado; sem autoplay com som. Campos com
Label; erros por id. Confirmação de arquivar com foco no botão seguro.

## 11. Critérios de aceite

- [ ] Mostra metadados, uso, direitos e versões em linguagem de produto.
- [ ] "Salvar" só com mudança; salva com undo.
- [ ] "Substituir arquivo" bloqueado durante Preparando; confirma se no ar.
- [ ] "Arquivar" confirma quando em uso; undo quando não.
- [ ] Direitos nunca afirmam legalidade.
- [ ] Edição concorrente tratada; a11y AA.

## 12. Dependências

Catalog API (pronto), player de áudio acessível, `Dialog` (arquivar), `Toast`.
Telas 03 (origem) e 06/07 (uso em campanhas).
