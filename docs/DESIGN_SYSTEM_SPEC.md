# Design System Spec — Congelado

> Cores, espaçamento, grid, raio, elevação, sombras, bordas, tipografia,
> iconografia, movimento, durações, easing e breakpoints. **Nada aqui é decidido
> depois.** A fonte de verdade técnica são `packages/ui/src/tokens.ts` e
> `packages/ui/src/styles.css` — este documento os explica e os torna lei de
> produto. Divergência entre código e este documento resolve-se pelos tokens;
> mudar um token exige entrada no PRODUCT_DECISION_LOG.md.

## 0. Princípios do sistema visual

Norte estético (Princípio Fundador 10): **Linear, Stripe, Notion, Vercel** —
neutros contidos, **um** acento confiante, espaço em branco generoso, tipografia
nítida. Regra dura: **componentes consomem tokens; nada codifica valor cru.**
Cor não é decoração — carrega significado (marca, sucesso, atenção, crítico).

Todas as cores são definidas em **oklch** (luminância perceptual + croma + matiz),
o que garante contraste consistente entre tons e um dark mode previsível.

## 1. Cor

### 1.1 Neutros (matiz 260 — cinza frio)

| Token         | oklch                    | Uso                                         |
| ------------- | ------------------------ | ------------------------------------------- |
| `neutral-0`   | `oklch(100% 0 0)`        | Fundo claro puro (background)               |
| `neutral-50`  | `oklch(98.4% 0.002 260)` | Fundo sutil / zebra                         |
| `neutral-100` | `oklch(96.5% 0.003 260)` | Superfície `muted` (claro)                  |
| `neutral-200` | `oklch(92.5% 0.004 260)` | Borda padrão (claro)                        |
| `neutral-300` | `oklch(86.5% 0.006 260)` | Divisores fortes / borda hover              |
| `neutral-400` | `oklch(71% 0.01 260)`    | Ícones desabilitados / placeholder          |
| `neutral-500` | `oklch(55.5% 0.012 260)` | Texto secundário (`muted-foreground` claro) |
| `neutral-600` | `oklch(44.5% 0.012 260)` | Texto de apoio                              |
| `neutral-700` | `oklch(37% 0.011 260)`   | Borda (dark)                                |
| `neutral-800` | `oklch(26.5% 0.009 260)` | Borda (dark) / superfície elevada dark      |
| `neutral-900` | `oklch(20.5% 0.008 260)` | Texto principal (claro) / `muted` (dark)    |
| `neutral-950` | `oklch(14.5% 0.007 260)` | Fundo (dark)                                |

### 1.2 Marca (matiz 285 — índigo-violeta Senvori)

| Token       | oklch                   | Uso                                        |
| ----------- | ----------------------- | ------------------------------------------ |
| `brand-50`  | `oklch(97% 0.014 285)`  | Fundo de destaque muito sutil              |
| `brand-100` | `oklch(93.5% 0.03 285)` | Chip/badge marca (fundo)                   |
| `brand-200` | `oklch(88% 0.06 285)`   | Borda de estado selecionado sutil          |
| `brand-300` | `oklch(80.5% 0.1 285)`  | —                                          |
| `brand-400` | `oklch(71.5% 0.15 285)` | Realce em dark                             |
| `brand-500` | `oklch(62% 0.2 285)`    | **Cor de foco (`ring`)** e acento primário |
| `brand-600` | `oklch(54.5% 0.22 285)` | **Botão primário (fundo)**                 |
| `brand-700` | `oklch(48% 0.2 285)`    | Botão primário `:hover`/`:active`          |
| `brand-800` | `oklch(41.5% 0.17 285)` | —                                          |
| `brand-900` | `oklch(36% 0.14 285)`   | Texto marca sobre fundo claro              |
| `brand-950` | `oklch(25.5% 0.1 285)`  | —                                          |

**Uso do acento:** um só acento no produto. A marca marca **a ação primária, o
foco e o estado ativo** — nunca preenche áreas grandes nem decora.

### 1.3 Semânticas (significado, não estética)

| Token     | oklch                 | Significado de produto              | Rótulo   |
| --------- | --------------------- | ----------------------------------- | -------- |
| `success` | `oklch(64% 0.15 155)` | Pronto, no ar, concluído            | verde    |
| `warning` | `oklch(76% 0.16 75)`  | Atenção, pendência, prazo           | âmbar    |
| `danger`  | `oklch(58% 0.21 27)`  | Crítico, falha, offline, destrutivo | vermelho |
| `info`    | `oklch(64% 0.14 240)` | Informação neutra, dica, IA         | azul     |

Regra: severidade é **codificada por cor antes da leitura** (faixa/ponto), mas cor
**nunca** é o único portador de significado — sempre acompanha ícone e/ou texto
(ver ACCESSIBILITY_GUIDE.md).

### 1.4 Tokens semânticos de superfície (o que a UI realmente usa)

| Token              | Claro         | Escuro        |
| ------------------ | ------------- | ------------- |
| `background`       | `neutral-0`   | `neutral-950` |
| `foreground`       | `neutral-900` | `neutral-100` |
| `muted`            | `neutral-100` | `neutral-900` |
| `muted-foreground` | `neutral-500` | `neutral-400` |
| `border`           | `neutral-200` | `neutral-800` |
| `ring` (foco)      | `brand-500`   | `brand-500`   |

**Componentes referenciam tokens semânticos** (`background`, `foreground`,
`muted`, `border`, `ring`), nunca a rampa crua. Isso garante que o dark mode
funcione sem tocar em componente.

### 1.5 Dark mode

Ativado por `@media (prefers-color-scheme: dark)` sobrescrevendo os tokens de
superfície em `:root`. As rampas neutra e de marca **não mudam**; apenas os
tokens semânticos apontam para outros degraus. Não há segundo conjunto de cores a
manter. Contraste é validado nos dois esquemas (ver §12 e ACCESSIBILITY_GUIDE.md).

## 2. Espaçamento (base 4px)

Escala única, base **4px**. Proibido valor fora da escala (sem `13px`, sem
`padding: 7px`).

| Chave | rem     | px  |
| ----- | ------- | --- |
| `0`   | 0       | 0   |
| `1`   | 0.25rem | 4   |
| `2`   | 0.5rem  | 8   |
| `3`   | 0.75rem | 12  |
| `4`   | 1rem    | 16  |
| `5`   | 1.25rem | 20  |
| `6`   | 1.5rem  | 24  |
| `8`   | 2rem    | 32  |
| `10`  | 2.5rem  | 40  |
| `12`  | 3rem    | 48  |
| `16`  | 4rem    | 64  |
| `20`  | 5rem    | 80  |
| `24`  | 6rem    | 96  |

**Ritmo padrão:** padding interno de card = `6` (24px); gap entre cards = `4`
(16px); gap entre seções = `8`–`12`; padding de página = `6` mobile / `8`+ desktop.
Espaço em branco é recurso, não desperdício (Princípio de elegância).

## 3. Grid e layout

- **Grade base:** 4px (tudo alinha à escala de espaçamento).
- **Largura máxima de leitura** do conteúdo: `Container` confortável
  (~1120–1280px), centralizado; texto corrido nunca ultrapassa ~72ch.
- **Shell autenticado:** sidebar fixa à esquerda (largura ~248–280px, colapsável
  em ≤ `md`) + área de conteúdo fluida. Ver INFORMATION_ARCHITECTURE.md.
- **Colunas de listagem (cards):** grid responsivo `auto-fill`/`minmax` —
  1 col (mobile) → 2 (`sm`) → 3 (`lg`) → 4 (`xl`), gap `4`.
- **Alinhamento:** um eixo primário por tela; ação primária no canto superior
  direito da barra de topo; nada de layouts assimétricos sem razão.

## 4. Raio (radius)

| Token  | rem      | px  | Uso                                             |
| ------ | -------- | --- | ----------------------------------------------- |
| `sm`   | 0.25rem  | 4   | Chips, badges, inputs pequenos                  |
| `md`   | 0.375rem | 6   | **Botões, inputs, campos** (padrão)             |
| `lg`   | 0.5rem   | 8   | **Cards, popovers, menus**                      |
| `xl`   | 0.75rem  | 12  | Modais, painéis grandes, superfícies destacadas |
| `full` | 9999px   | —   | Avatares, pílulas de status, toggles            |

Consistência: um card é sempre `lg`; um botão é sempre `md`. Não misturar.

## 5. Elevação, sombras e bordas

Elevação comunica **hierarquia**, não profundidade decorativa. Escala mínima:

| Nível | Token       | Valor                                                                 | Uso                               |
| ----- | ----------- | --------------------------------------------------------------------- | --------------------------------- |
| 0     | —           | sem sombra, borda `1px border`                                        | Superfície base, cards em repouso |
| 1     | `shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)`                                       | Card hover / input focado         |
| 2     | `shadow-md` | `0 2px 8px -2px rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)`  | Dropdowns, popovers, toasts       |
| 3     | `shadow-lg` | `0 8px 24px -6px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.08)` | Modais, painéis flutuantes        |

**Bordas:** padrão `1px solid var(--color-border)`. Em dark, a borda (`neutral-800`)
substitui grande parte do papel da sombra. Nunca empilhar sombra forte + borda
forte no mesmo elemento.

## 6. Tipografia

**Família:** `Inter` (com fallback system-ui). Mono: `ui-monospace` (só para
IDs/valores técnicos em detalhes opcionais, nunca em conceito de produto).

### 6.1 Escala de tamanho

| Chave  | rem      | px  | Uso típico                             |
| ------ | -------- | --- | -------------------------------------- |
| `xs`   | 0.75rem  | 12  | Legendas, metadados, timestamps        |
| `sm`   | 0.875rem | 14  | Texto de apoio, labels, tabelas densas |
| `base` | 1rem     | 16  | Corpo padrão                           |
| `lg`   | 1.125rem | 18  | Subtítulo / destaque de corpo          |
| `xl`   | 1.25rem  | 20  | Título de card                         |
| `2xl`  | 1.5rem   | 24  | Título de seção                        |
| `3xl`  | 1.875rem | 30  | Título de página                       |
| `4xl`  | 2.25rem  | 36  | Números-herói (KPIs no Início)         |

### 6.2 Peso

| Nome       | Valor | Uso                                |
| ---------- | ----- | ---------------------------------- |
| `regular`  | 400   | Corpo                              |
| `medium`   | 500   | Labels, botões, ênfase leve        |
| `semibold` | 600   | Títulos, KPIs                      |
| `bold`     | 700   | Reservado (uso raro, número-herói) |

### 6.3 Altura de linha (leading)

`tight` 1.25 (títulos e números) · `normal` 1.5 (corpo) · `relaxed` 1.625 (texto
longo de ajuda). Hierarquia por tamanho+peso+cor, nunca por sublinhado ou caixa
alta decorativa.

## 7. Iconografia

- **Estilo único:** linha (stroke), traço ~1.5–2px, cantos levemente arredondados,
  grid 24px. Um só família de ícones no produto inteiro (consistência > novidade).
- **Tamanhos:** `16` (inline/label), `20` (botões/itens de menu), `24` (nav
  primária), `20–24` em estados vazios ampliados.
- **Cor:** herda `currentColor` (segue o texto). Ícone semântico usa a cor
  semântica correspondente.
- **Regra:** ícone nunca sozinho sem rótulo acessível (`aria-label` ou texto
  visível). Ícone reforça significado, não o substitui.
- Conceitos de nav congelados em INFORMATION_ARCHITECTURE.md (§1).

## 8. Movimento — tokens (detalhe completo em MOTION_GUIDE.md)

Movimento **comunica estado ou continuidade**; nunca decora. Se respeitar
`prefers-reduced-motion: reduce`, animações de deslocamento/opacidade grande são
substituídas por transição instantânea ou fade curto.

### 8.1 Durações

| Token     | ms  | Uso                                                 |
| --------- | --- | --------------------------------------------------- |
| `instant` | 0   | Feedback que deve parecer imediato / reduced-motion |
| `fast`    | 120 | Hover, foco, press, mudança de cor                  |
| `base`    | 200 | Entradas de menu/popover, toasts, expand            |
| `slow`    | 320 | Modal, painel lateral, transição de página          |

Nada acima de ~400ms na interface operacional.

### 8.2 Easing (curvas)

| Token        | curva                        | Uso                          |
| ------------ | ---------------------------- | ---------------------------- |
| `standard`   | `cubic-bezier(0.2, 0, 0, 1)` | Entradas/saídas gerais       |
| `decelerate` | `cubic-bezier(0, 0, 0, 1)`   | Elemento entrando (aparece)  |
| `accelerate` | `cubic-bezier(0.3, 0, 1, 1)` | Elemento saindo (desaparece) |
| `linear`     | `linear`                     | Progresso, spinners, barras  |

## 9. Breakpoints

| Nome   | min-width | Alvo                                              |
| ------ | --------- | ------------------------------------------------- |
| (base) | 0         | Telefone (mobile-first)                           |
| `sm`   | 640px     | Telefone grande / paisagem                        |
| `md`   | 768px     | Tablet — sidebar colapsa/vira drawer abaixo daqui |
| `lg`   | 1024px    | Laptop — layout de 3 colunas de cards             |
| `xl`   | 1280px    | Desktop — largura plena de trabalho               |
| `2xl`  | 1536px    | Monitor grande — largura máxima travada           |

Mobile-first: estilos base valem no telefone; `min-width` progressivamente
enriquece. A operação real acontece em desktop, mas nenhuma tela quebra no
telefone (ver responsividade em cada SCREEN_SPECIFICATIONS/).

## 10. Estados interativos (tokens de estado)

Todo elemento interativo define os cinco estados (detalhe em INTERACTION_GUIDE.md):

| Estado          | Tratamento padrão                                                      |
| --------------- | ---------------------------------------------------------------------- |
| `default`       | Token de superfície + borda base                                       |
| `hover`         | Escurece/realça 1 degrau (`fast`), cursor `pointer`                    |
| `focus-visible` | Anel `2px` `var(--color-ring)` + `2px` offset — **nunca removido**     |
| `active/press`  | 1 degrau mais escuro, sem deslocar layout                              |
| `disabled`      | Opacidade reduzida, sem sombra, `cursor: not-allowed`, `aria-disabled` |

## 11. Regras de aplicação (não negociáveis)

1. **Só tokens.** Nenhum hex/rgb/px cru em componente. Valor novo = token novo +
   decisão registrada.
2. **Um acento.** Marca só na ação primária, foco e estado ativo.
3. **Cor com reforço.** Significado nunca depende só de cor.
4. **Escala 4px.** Espaçamento e tamanho saem sempre da escala.
5. **Um raio por tipo.** Card `lg`, botão `md`, pílula `full` — sempre.
6. **Elevação com propósito.** Sombra = hierarquia, não enfeite.
7. **Movimento com propósito.** Anima estado/continuidade; respeita reduced-motion.
8. **Dark mode via tokens semânticos**, nunca por override em componente.

## 12. Contraste (piso WCAG AA)

- Texto normal ≥ **4.5:1**; texto grande (≥ `2xl`/24px semibold) ≥ **3:1**;
  elementos de interface e foco ≥ **3:1**.
- Pares validados: `foreground` sobre `background`; `muted-foreground` sobre
  `background` e sobre `muted`; texto branco sobre `brand-600`; texto branco sobre
  `danger`/`success`/`warning`(usar texto escuro no âmbar). Detalhe e matriz
  completa em ACCESSIBILITY_GUIDE.md §Contraste.
