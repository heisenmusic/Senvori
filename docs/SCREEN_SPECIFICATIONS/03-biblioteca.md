# 03 · Biblioteca (lista)

## 1. Objetivo

Mostrar o conteúdo da marca como **patrimônio visual** e permitir encontrar,
adicionar e organizar o que vai alimentar as campanhas.

## 2. Persona & pergunta

Diretor de Marketing: "Que conteúdo minha marca tem, e o que já está pronto para usar?"

## 3. Rota & navegação

- Rota `/[locale]/biblioteca`.
- Item da nav primária #2. Breadcrumb: raiz (sem breadcrumb).

## 4. Dados exibidos

- Grade de **cards de conteúdo**: capa, título, artista/origem, tipo (Música/Locução),
  duração, status (badge), campanha vinculada, direitos declarados.
- Busca local, filtros como chips, contagem de resultados.
- Fonte: `@senvori/sdk` catalog (`catalog:asset:read`).

## 5. KPIs / métricas

Contagem por status opcional no topo (ex.: "128 prontos · 3 preparando"). Sem herói.

## 6. Ações

- **Primária:** "Adicionar conteúdo" (`catalog:asset:create`) → abre painel de envio (tela 04).
- **Secundárias:** buscar, filtrar, ordenar (recentes/mais tocados/A–Z), abrir
  conteúdo (tela 05), arquivar (undo), adicionar a campanha/coleção.

## 7. Permissões

- Sem `catalog:asset:read` → destino oculto na nav.
- "Adicionar/Arquivar" só com permissão correspondente; senão ocultas.

## 8. Estados

- **Loading:** skeleton de cards.
- **Vazio inicial:** "Sua biblioteca ainda está vazia." + "Adicionar conteúdo".
- **Sem resultado de busca:** "Nada encontrado para '{termo}'." + "Limpar filtros".
- **Erro:** "Não foi possível carregar sua biblioteca." + "Tentar novamente".
- **Offline:** cards já carregados visíveis; adicionar bloqueado com aviso.
- **Item Preparando/Falhou:** badge próprio; Preparando não é selecionável para campanha.

## 9. Responsividade

Grid `auto-fill`: 1→2→3→4 colunas (mobile→`xl`), gap 16px. Filtros viram drawer em mobile.

## 10. Acessibilidade

Cada card é um alvo nomeado (título); status por badge (cor+texto). Busca é
`type=search` com label. Grade navegável por teclado; foco visível.

## 11. Critérios de aceite

- [ ] Cards mostram capa/título/tipo/duração/status/direitos.
- [ ] Só conteúdo **Pronto** é selecionável para campanha.
- [ ] Filtro nunca some resultado em silêncio; chips removíveis; "Limpar filtros".
- [ ] Ordenação padrão "recentes" (não alfabética).
- [ ] Vazio e sem-resultado úteis; arquivar com undo.
- [ ] a11y AA; termos de produto (nenhum "asset"/"upload").

## 12. Dependências

Catalog API (pronto), `ContentCard`, `Badge`, `EmptyState`, filtros. Tela 04 (envio)
e tela 05 (detalhe).
