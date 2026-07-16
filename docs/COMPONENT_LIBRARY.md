# Component Library — Congelada

> A biblioteca de componentes da Senvori. Cada componente aqui é a **única forma
> permitida** de resolver seu problema de interface. Se algo não existe aqui, não
> se inventa na tela — cria-se o componente aqui primeiro (com decisão registrada).
> Base técnica atual: `packages/ui`. Fonte de verdade de valores: DESIGN_SYSTEM_SPEC.md.

Cada componente tem: **objetivo · quando usar · quando NÃO usar · variantes ·
estados · responsividade · acessibilidade · movimento · tokens · exemplo ·
anti-padrões.**

Regras transversais (valem para todos):

- Consomem **tokens semânticos**, nunca valores crus.
- Todo interativo tem os 5 estados (default/hover/focus-visible/active/disabled).
- `focus-visible` sempre visível (anel `ring`, 2px + 2px offset) — nunca removido.
- Alvo de toque mínimo **44×44px** em mobile.
- Texto vem do UX_COPY_GUIDE.md; nunca hardcode fora dos contratos de i18n.

---

## 1. Primitivos de layout

### 1.1 `Container`

- **Objetivo:** limitar a largura de leitura e centralizar o conteúdo.
- **Quando usar:** envolver o conteúdo de qualquer página autenticada.
- **Quando NÃO usar:** dentro de um card já contido; para full-bleed (mapas, faixas).
- **Variantes:** largura padrão (~1120–1280px). Sem outras.
- **Responsividade:** padding lateral `6` (mobile) → `8`+ (desktop).
- **Anti-padrão:** texto corrido ocupando 100% de um monitor largo.

### 1.2 `Stack`

- **Objetivo:** empilhar filhos com espaçamento consistente da escala.
- **Quando usar:** qualquer sequência vertical (ou horizontal) de elementos.
- **Quando NÃO usar:** grids de cards (usar grid responsivo).
- **Props conceituais:** direção (vertical padrão), `gap` (chave da escala 4px).
- **Anti-padrão:** margens soltas entre irmãos em vez de `gap`.

### 1.3 `PageHeader`

- **Objetivo:** barra de topo por tela — título, subtítulo, ação primária.
- **Quando usar:** topo de toda tela autenticada (uma vez por tela).
- **Quando NÃO usar:** dentro de cards; para mais de uma ação primária.
- **Composição:** título (`3xl`/semibold) + subtítulo (`sm`/muted-foreground) à
  esquerda; slot de ação primária (`Button`) à direita; breadcrumb acima em
  telas de detalhe (profundidade ≥ 2).
- **Responsividade:** em ≤ `sm`, ação primária desce para baixo do título (full-width).
- **A11y:** título é o `<h1>` da tela; um só por tela.
- **Anti-padrão:** dois botões primários; título genérico ("Página").

---

## 2. Ações

### 2.1 `Button`

- **Objetivo:** disparar uma ação. O rótulo diz o resultado ("Publicar campanha").
- **Quando usar:** qualquer ação. **Quando NÃO usar:** navegação pura (usar link).
- **Variantes (hierarquia de ênfase):**
  | Variante      | Uso                                 | Aparência                                |
  | ------------- | ----------------------------------- | ---------------------------------------- |
  | `primary`     | **uma** por tela — a ação principal | fundo `brand-600`, texto branco          |
  | `secondary`   | ações de apoio                      | fundo `muted`, texto `foreground`, borda |
  | `ghost`       | ações terciárias / em barras densas | sem fundo, texto `foreground`            |
  | `destructive` | ação destrutiva confirmada          | fundo/borda `danger`                     |
  | `link`        | ação que parece link                | texto `brand-700`, sublinhado no hover   |
- **Tamanhos:** `sm` (32px), `md` (40px, padrão), `lg` (48px). Raio `md`.
- **Estados:** hover (−1 degrau, `fast`), focus-visible (anel `ring`), active
  (−1 degrau, sem deslocar), disabled (opacidade + `not-allowed`), **loading**
  (spinner + rótulo mantido + `aria-busy`, botão inerte).
- **Responsividade:** full-width em ações primárias de formulários mobile.
- **A11y:** `<button>` real; ícone-só exige `aria-label`; loading anuncia via `aria-busy`.
- **Anti-padrão:** "OK"/"Enviar"/"Confirmar" soltos; dois primários; botão que
  navega sem ser link; desabilitar sem explicar o porquê.

### 2.2 `IconButton` (variante de Button)

- **Objetivo:** ação compacta representada por ícone (fechar, mais opções).
- **Regra:** sempre `aria-label`; alvo 40–44px; tooltip no hover/focus.
- **Anti-padrão:** ícone ambíguo sem rótulo; usar para a ação primária da tela.

---

## 3. Entrada de dados

### 3.1 `Input`

- **Objetivo:** entrada de texto de uma linha.
- **Tipos:** `text`, `search`, `email`, `password`, `number`. Raio `md`, borda
  `border`, foco = anel `ring`.
- **Estados:** default, focus, disabled, **erro** (borda `danger` + mensagem
  abaixo, `aria-invalid` + `aria-describedby`), com ícone/prefixo opcional.
- **A11y:** sempre associado a `Label` (`htmlFor`); erro descrito por id.
- **Anti-padrão:** placeholder como rótulo; erro só por cor; validação agressiva
  a cada tecla (validar no blur/submit — ver INTERACTION_GUIDE.md).

### 3.2 `Label`

- **Objetivo:** rótulo acessível de um campo.
- **Regra:** obrigatório para todo campo; marca opcional/obrigatório em texto,
  não só por asterisco de cor.

### 3.3 Campos compostos (especificados, base a implementar)

`Textarea`, `Select` (menu acessível por teclado), `Combobox`/busca com sugestões,
`Checkbox`, `Radio`, `Switch` (toggle, raio `full`), `DatePicker`/período,
`FileDrop` (área de envio — ver Biblioteca). Todos seguem os mesmos 5 estados,
rótulo obrigatório, erro descrito por id, foco visível.

---

## 4. Exibição de dados

### 4.1 `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`)

- **Objetivo:** agrupar informação relacionada numa superfície.
- **Quando usar:** item de biblioteca, bloco de KPI, cartão de loja, insight de IA.
- **Quando NÃO usar:** para texto corrido simples; aninhar card dentro de card.
- **Composição:** `CardHeader` (título + descrição opcional + ação no canto) →
  `CardContent`. Raio `lg`, borda `border`, sombra 0 em repouso → `sm` no hover
  quando clicável.
- **Responsividade:** em grid `auto-fill`, 1→2→3→4 colunas por breakpoint.
- **A11y:** card clicável inteiro = um alvo com nome acessível; ações internas não
  aninham botão-dentro-de-link.
- **Anti-padrão:** card cinza tipo linha de tabela; múltiplas ações concorrendo.

### 4.2 `Table` (+ `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`)

- **Objetivo:** dados densos e comparáveis (Equipe, históricos, detalhes técnicos).
- **Quando usar:** quando comparar linhas/colunas é o ponto. **Quando NÃO usar:**
  para conteúdo que é patrimônio visual (Biblioteca usa cards; Lojas usam cartões).
- **Recursos:** cabeçalho fixo, ordenação por coluna (indicada por ícone + `aria-sort`),
  zebra opcional (`neutral-50`), linha hover, densidade confortável (padding `3`–`4`).
- **Responsividade:** em ≤ `md`, colapsa em lista de cartões (cada linha vira cartão
  rótulo→valor) — nunca scroll horizontal forçado sem contêiner `overflow-x:auto`.
- **A11y:** `<table>` semântica, `<th scope>`, `aria-sort`; nunca tabela para layout.
- **Anti-padrão:** usar tabela como grade de layout; 12 colunas no telefone.

### 4.3 `Badge`

- **Objetivo:** rótulo de status/categoria curto e não interativo.
- **Variantes (existentes):** `default` (marca), `neutral`, `outline`, `success`,
  `danger`. A definir por decisão: `warning`, `info` (adicionar à mesma escala).
- **Mapeamento de status de conteúdo** (ver PRODUCT_LANGUAGE §4):
  | Estado     | Rótulo     | Variante            |
  | ---------- | ---------- | ------------------- |
  | uploading  | Enviando   | `neutral`           |
  | processing | Preparando | `default` (marca)   |
  | ready      | Pronto     | `success`           |
  | failed     | Falhou     | `danger`            |
  | archived   | Arquivado  | `neutral`/`outline` |
- **A11y:** cor + texto sempre juntos; badge não é botão.
- **Anti-padrão:** badge clicável; status só por cor; badge como título.

### 4.4 `StatMetric` / bloco de KPI (especificado)

- **Objetivo:** número com significado (Início). Composto por: valor-herói (`4xl`
  semibold), rótulo humano (`sm` muted), comparação (▲/▼ + % com cor semântica) e
  sparkline opcional.
- **Regra:** nunca número sozinho; comparação sempre que houver base (ver
  PRODUCT_PHILOSOPHY §2). Seta ▲ em `success` só quando "para cima" é bom.
- **Anti-padrão:** "184.213" sem rótulo nem comparação.

### 4.5 `Avatar`

- Iniciais/imagem, raio `full`, tamanhos 24/32/40. `aria-label` com o nome.

---

## 5. Navegação

### 5.1 `Sidebar` / `NavItem`

- **Objetivo:** navegação primária congelada (INFORMATION_ARCHITECTURE §1).
- **Composição:** ícone (24) + rótulo; item ativo com destaque de marca (barra/fundo
  `brand-50`, texto `brand-900`); rodapé com seletor de Empresa + menu do usuário.
- **Responsividade:** fixa em ≥ `lg`; drawer sobreposto abaixo de `md` (abre por
  botão, fecha com `Esc`/backdrop).
- **A11y:** `<nav aria-label>`, item ativo `aria-current="page"`; navegável por Tab.
- **Anti-padrão:** ordem alfabética; itens sem permissão visíveis; > 7 itens primários.

### 5.2 `Breadcrumb`

- Só em detalhe (≥ 2 níveis); primeiro nível é link, último é texto (o título do item).

### 5.3 `Tabs`

- **Objetivo:** alternar vistas de um mesmo objeto (ex.: Loja: Agora/Programação/Histórico).
- **A11y:** papel `tablist`/`tab`/`tabpanel`, setas do teclado navegam.
- **Anti-padrão:** tabs para navegar entre telas diferentes (isso é sidebar).

### 5.4 `CommandPalette` (⌘K)

- Busca global (INFORMATION_ARCHITECTURE §3). Resultados agrupados por tipo; teclado
  ponta a ponta; `Esc` fecha; foco preso enquanto aberto.

---

## 6. Sobreposições (overlays)

### 6.1 `Dialog` / `Modal`

- **Objetivo:** decisão focada que interrompe (confirmação destrutiva, formulário curto).
- **Quando NÃO usar:** para ação reversível (usar undo/toast); para fluxo longo
  (usar página/painel).
- **Comportamento:** foco preso, `Esc` fecha (exceto durante submit), backdrop
  clicável fecha só se não destrutivo, retorno de foco ao gatilho. Raio `xl`,
  sombra `lg`. Entra com `slow` + fade.
- **A11y:** `role="dialog"` `aria-modal`, título referenciado por `aria-labelledby`.
- **Anti-padrão:** modais empilhados; modal para tudo; fechar apagando dado sem undo.

### 6.2 `Drawer` / painel lateral

- Para detalhe/edição contextual sem sair da lista (ex.: metadados de conteúdo).
  Mesmo contrato de foco/`Esc` do Dialog; desliza de um lado (RTL-safe: logical).

### 6.3 `Popover` / `DropdownMenu`

- Menu de ações contextuais ("mais opções"). `role="menu"`, setas navegam, `Esc`
  fecha, foco volta ao gatilho. Sombra `md`, raio `lg`.

### 6.4 `Tooltip`

- Dica curta no hover/focus de um controle. Nunca conteúdo essencial só no tooltip;
  aparece após ~300ms; some no blur; não recebe foco.

---

## 7. Feedback e estado

### 7.1 `Toast`

- **Objetivo:** confirmar resultado de ação (com **undo** quando reversível).
- **Comportamento:** aparece por ~5s (mais quando há undo), empilha no máximo 3,
  `aria-live="polite"` (erro = `assertive`). Undo é a ação principal do toast.
- **Anti-padrão:** toast para erro que exige decisão (usar inline/dialog); toast
  que some rápido demais para clicar em Desfazer.

### 7.2 `Skeleton`

- Placeholder do formato do conteúdo durante o carregamento (não spinner genérico
  em telas com layout conhecido). Shimmer sutil (respeita reduced-motion).

### 7.3 `Spinner` / `ProgressBar`

- Spinner para espera curta indeterminada em um controle; ProgressBar para envio
  com progresso conhecido (upload). `role="progressbar"` com valores.

### 7.4 `EmptyState`

- **Objetivo:** transformar "vazio" em primeiro passo útil. Ícone + título humano
  - 1 frase + ação primária. Nunca "Nenhum registro encontrado".
- **Variações:** vazio inicial (convida a criar) vs. sem resultado de busca (sugere
  limpar filtro). Ver UX_COPY_GUIDE.md.

### 7.5 `Alert` / `Banner`

- Mensagem persistente de severidade (info/atenção/crítico) com faixa de cor
  semântica + ícone + próxima ação. Usado em topo de tela e em cartões de problema.

### 7.6 `InsightCard` (IA)

- **Objetivo:** trazer a IA "onde a decisão acontece" (Início, Campanha, Programação).
  Contexto (texto de analista) + ação sugerida (Button) + descartar. Tom de
  analista sênior, nunca chatbot (PRODUCT_PHILOSOPHY §2). Cor `info`/marca sutil.
- **Anti-padrão:** "Como posso ajudar?"; executar sozinho ação irreversível.

---

## 8. Domínio (compostos de produto)

- `ContentCard` — item da Biblioteca (capa, título, tipo, duração, status, direitos).
- `StoreCard` — loja viva (tocando agora, status no ar/offline/alerta, sync).
- `CampaignCard` — campanha (nome, status, período, alcance em lojas).
- `WizardStepper` — passos da campanha (Objetivo→…→Publicação), com estado por passo.
- `ScheduleGrid` — grade de programação (dia/hora × loja/grupo).
- `RightsBadge` — direitos declarados (linguagem segura, PRODUCT_LANGUAGE §3).

Cada composto reusa os primitivos acima e é detalhado na spec da tela onde vive.

---

## 9. Anti-padrões globais (proibidos em qualquer componente)

1. Valor cru (hex/px) em vez de token.
2. Remover o anel de foco.
3. Significado só por cor.
4. Dois botões primários na mesma tela.
5. Confirmação para ação reversível (deve ser undo).
6. Spinner genérico onde cabe skeleton.
7. Estado vazio "sem registros" em vez de primeiro passo útil.
8. Tabela para conteúdo que é patrimônio visual.
9. Jargão técnico em qualquer rótulo (ver PRODUCT_LANGUAGE.md).
10. Componente novo inventado na tela sem entrar aqui primeiro.
