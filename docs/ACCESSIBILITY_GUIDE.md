# Accessibility Guide — WCAG AA é Piso

> Acessibilidade não é etapa final: é critério de aceite de toda tela e todo
> componente (Princípio Fundador 8). **WCAG 2.1 AA é o piso, não a meta.** Nenhuma
> tela é "pronta" se falha aqui.

## 1. Contraste (obrigatório)

- Texto normal ≥ **4.5:1**; texto grande (≥ 24px ou 19px bold) ≥ **3:1**.
- Componentes de UI e estados (borda de input, ícone significativo, foco) ≥ **3:1**.
- Foco visível ≥ **3:1** contra o fundo adjacente.

Pares validados (claro e escuro), tokens de DESIGN_SYSTEM_SPEC.md:

| Primeiro plano                       | Fundo                   | Onde                                            |
| ------------------------------------ | ----------------------- | ----------------------------------------------- |
| `foreground` (neutral-900/100)       | `background`            | corpo                                           |
| `muted-foreground` (neutral-500/400) | `background` / `muted`  | texto secundário                                |
| branco                               | `brand-600`             | botão primário                                  |
| branco                               | `danger` / `success`    | badges/botões destrutivos e de sucesso          |
| texto escuro                         | `warning` (âmbar claro) | badge de atenção — **texto escuro**, não branco |

Regra: **cor nunca é o único portador de significado** — sempre acompanha ícone,
texto ou padrão (status, erro de campo, severidade de alerta).

## 2. Teclado (operação completa sem mouse)

- Tudo que é clicável é **focável e acionável** por teclado (Tab, Enter, Space, setas).
- Ordem de foco = ordem visual/lógica; sem `tabindex` positivo.
- Sem armadilha de foco fora de overlays; overlays **prendem** foco e devolvem ao
  gatilho ao fechar.
- `Esc` fecha overlay não destrutivo; setas navegam menu/tabs/listas/grade.
- **Skip link** "Pular para o conteúdo" é o primeiro focável da página.
- Atalhos globais (⌘K, `/`, `Esc`) nunca são o único caminho para uma ação.

## 3. Foco visível

- `:focus-visible` sempre presente: anel `ring` (`brand-500`) 2px + 2px offset.
- **Nunca** `outline: none` sem substituto equivalente.
- Foco distingue teclado de clique de mouse (não polui clique com anel).

## 4. Semântica e ARIA

- **HTML semântico primeiro**, ARIA só quando o nativo não basta.
- Landmarks: `<header>`, `<nav aria-label>`, `<main>`, `<aside>`, `<footer>`.
- Um `<h1>` por tela (título do `PageHeader`); hierarquia de headings sem pular nível.
- Botões são `<button>`; links são `<a>`; nunca `div` clicável sem papel/role e teclado.
- Nome acessível em todo controle: `<label htmlFor>`, `aria-label`, ou `aria-labelledby`.
- Estados dinâmicos: `aria-expanded`, `aria-selected`, `aria-current="page"`,
  `aria-invalid`, `aria-busy`, `aria-disabled`, `aria-sort`.
- Diálogos: `role="dialog"` `aria-modal="true"` + `aria-labelledby` no título.

## 5. Regiões vivas (anúncios)

- Área de conteúdo tem `aria-live="polite"` para trocas de estado (carregando,
  carregado, resultados de busca).
- Toasts de sucesso/informação: `polite`; erros que exigem atenção: `assertive`.
- Progresso de envio anunciado por marcos (ex.: 25/50/75/100%), não a cada 1%.
- Anúncios são concisos e em linguagem de produto (nunca jargão).

## 6. Formulários acessíveis

- Todo campo tem `Label` associado; obrigatório/opcional dito em texto, não só cor.
- Erro: `aria-invalid="true"` + mensagem ligada por `aria-describedby`; foco vai ao
  primeiro inválido no submit; resumo de erros quando o formulário é longo.
- Placeholder **não** substitui rótulo.
- Agrupamentos usam `<fieldset>`/`<legend>`.

## 7. Imagens, ícones e mídia

- Ícone significativo tem `aria-label`; ícone decorativo é `aria-hidden`.
- Capas de conteúdo têm `alt` com o título; imagens decorativas têm `alt=""`.
- Player de áudio: controles rotulados, estado (tocando/pausado) anunciado, sem
  autoplay com som sem controle.

## 8. Zoom e reflow

- Suporta zoom até **200%** sem perda de conteúdo ou função.
- Reflow a **320px** de largura (mobile) e a 400% de zoom sem scroll horizontal de
  página (conteúdo largo rola em contêiner próprio).
- Unidades relativas (`rem`) — respeitam o tamanho de fonte do sistema.
- Alvo de toque ≥ **44×44px**.

## 9. Leitor de tela

- Fluxo de leitura lógico; ordem do DOM = ordem visual.
- Conteúdo só-visual tem equivalente textual; nada essencial só em hover/cor/ícone.
- Tabelas com `<th scope>`; listas em `<ul>/<ol>`; nada de "tabela para layout".
- Mudanças de rota anunciam o novo título da tela.
- Testado com pelo menos um leitor por plataforma (NVDA/JAWS, VoiceOver).

## 10. Movimento e tempo

- `prefers-reduced-motion: reduce` respeitado em todo o produto (ver MOTION_GUIDE.md).
- Nada pisca mais de 3×/s (sem risco fotossensível).
- Sem limite de tempo que faça perder trabalho; sessão que expira **preserva o
  destino** e devolve o usuário ao ponto após novo login (ver EDGE_CASES.md).
- Undo dá tempo real de leitura/ação (≥ 5s, mais quando significativo).

## 11. Idiomas e i18n acessível

- `<html lang>` reflete o locale ativo (pt-BR/en-US/es-ES); trechos em outro idioma
  marcam `lang`.
- Textos traduzidos completos, sem truncar significado; layout aguenta strings mais
  longas (pt/es ~30% maiores que en).
- Direção lógica (logical properties) para futuro suporte RTL sem retrabalho.

## 12. Critérios de aceite de acessibilidade (por tela)

Uma tela só passa se:

1. Navegável e operável 100% por teclado, com foco visível.
2. Contrastes ≥ AA nos dois esquemas (claro/escuro).
3. Todo controle com nome acessível e papel correto.
4. Estados (carregando/erro/vazio/sucesso) anunciados.
5. Zoom 200% e reflow 320px sem quebra.
6. Reduced-motion respeitado.
7. Sem significado exclusivo por cor.
8. Sem armadilha de foco; overlays devolvem foco.

Estes critérios entram no PRODUCT_QA_CHECKLIST.md.
