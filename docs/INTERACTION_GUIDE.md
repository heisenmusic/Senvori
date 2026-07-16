# Interaction Guide — Comportamento Congelado

> Como cada interação se comporta: hover, foco, clique, carregamento, undo, drag,
> drop, scroll, skeleton, sucesso. Regra-mãe: **ação primeiro, confirmação por
> exceção** (undo por padrão). Timings e curvas vêm de DESIGN_SYSTEM_SPEC.md §8.

## 1. Estados de um elemento interativo

Todo controle define os cinco estados. Nenhum é opcional.

| Estado        | Gatilho               | Comportamento                                                 |
| ------------- | --------------------- | ------------------------------------------------------------- |
| default       | repouso               | superfície + borda base                                       |
| hover         | ponteiro sobre        | realce −1 degrau, `fast` (120ms), cursor `pointer`            |
| focus-visible | teclado/az            | anel `ring` 2px + offset 2px — **nunca removido**             |
| active/press  | mousedown/Enter/Space | −1 degrau, sem deslocar layout                                |
| disabled      | indisponível          | opacidade reduzida, `not-allowed`, `aria-disabled`, sem hover |

Toque (mobile): sem estado hover persistente; feedback de press imediato; alvo ≥ 44px.

## 2. Hover

- Só enriquece; **nunca** revela informação essencial exclusiva (que exclui touch
  e teclado). Tooltip aparece após ~300ms de hover **ou** ao focar.
- Card clicável: eleva de sombra 0 → `sm` e realça a borda.
- Linha de tabela: fundo `neutral-50`.
- Nunca dispara ação por hover; nunca reflow ao passar o mouse.

## 3. Foco (teclado)

- **Ordem de foco** segue a ordem visual/lógica (sem `tabindex` positivo).
- `focus-visible` distingue teclado de clique (não mostrar anel em clique de mouse).
- Em overlays (Dialog/Drawer/Menu/Palette): **foco preso**; ao abrir, foco vai ao
  primeiro elemento útil; ao fechar, **retorna ao gatilho**.
- Skip link "Pular para o conteúdo" no topo (ver ACCESSIBILITY_GUIDE.md).
- `Esc` fecha overlay não destrutivo; setas navegam menus/tabs/listas.

## 4. Clique / ativação

- Ação otimista quando segura: a UI reflete o resultado na hora e reconcilia com o
  servidor; se falhar, reverte com toast de erro + "Tentar novamente".
- Ação primária dispara com Enter/Space quando focada; um só primário por tela.
- Duplo clique nunca é requisito. Clique acidental em destrutivo é barrado por
  confirmação (só destrutivo/irreversível/grande alcance — ver §7).
- Botão que dispara trabalho entra em **loading** (spinner + rótulo mantido +
  `aria-busy`), inerte até responder, para evitar duplo envio.

## 5. Carregamento

- **Skeleton** onde o layout é conhecido (Início, Biblioteca, Lojas): placeholders
  do formato real, shimmer sutil (respeita reduced-motion). Nunca spinner de tela
  cheia onde cabe skeleton.
- **Spinner** só para espera curta e indeterminada dentro de um controle.
- **ProgressBar** quando o progresso é conhecido (envio de arquivo): `%` real.
- Carregamento nunca "trava" a UI silenciosamente: sempre há forma visível.
- `aria-live="polite"` anuncia "Carregando" / "Carregado" na área de conteúdo.

## 6. Undo (padrão para o reversível)

- Ação reversível acontece **na hora**, sem diálogo, e mostra toast com **"Desfazer"**
  por ~5–8s (mais tempo quando a ação é significativa).
- Exemplos: salvar metadado, arquivar conteúdo não-em-uso, remover filtro, mover
  para coleção, favoritar, reordenar.
- Undo restaura o estado exato anterior (inclui seleção/scroll quando relevante).
- Se a janela de undo expira, a ação é definitiva (mas ainda recuperável por
  caminho explícito quando aplicável, ex.: "Arquivados").

## 7. Confirmação (exceção)

Confirmamos **apenas**: destrutivo, irreversível ou grande alcance.

- Publicar/encerrar/pausar campanha em muitas lojas.
- Arquivar conteúdo **em uso** por campanha ativa.
- Remover pessoa da equipe.
- Mudança que afeta o que toca agora em centenas de lojas.

Diálogo de confirmação: título com o **alcance real** ("Isto afeta 412 lojas."),
botão destrutivo rotulado pela ação ("Encerrar campanha", nunca "OK"), botão
"Cancelar" secundário, foco inicial no seguro. `Esc`/backdrop cancelam.

## 8. Drag & drop

- **Onde existe:** envio de arquivos (Biblioteca), reordenar itens de uma
  campanha/coleção, reordenar regras de programação.
- **Affordance:** cursor `grab`/`grabbing`, alça visível, sombra `md` ao arrastar,
  linha/placeholder indicando o destino.
- **Drop zone:** realça (borda `brand`, fundo `brand-50`) quando um item paira sobre
  ela; volta ao normal ao sair.
- **Alternativa por teclado obrigatória:** todo drag tem equivalente por teclado
  (mover para cima/baixo, escolher destino) — drag nunca é o único caminho.
- **Feedback:** ao soltar, confirma com toast + undo; se soltar fora, cancela sem efeito.

## 9. Scroll

- Scroll da página é vertical; conteúdo largo (tabelas, grades) rola dentro do seu
  próprio contêiner `overflow-x:auto` — a página **nunca** rola na horizontal.
- Cabeçalhos de seção/tabela podem fixar (`sticky`) para manter contexto.
- Rolagem infinita **não** é padrão; listas longas paginam ou carregam por "Ver mais"
  (previsível, com contagem). Restaura posição de scroll ao voltar de um detalhe.
- Sem "scroll hijacking"; respeita a rolagem nativa do sistema.

## 10. Feedback de sucesso

- Toda ação tem resposta: toast breve e concreto ("Campanha publicada em 412 lojas."),
  com undo quando reversível.
- Feedback aparece perto da origem quando possível (salvar campo → "Salvo" inline;
  publicar → toast global).
- Sucesso nunca é silencioso; erro nunca é silencioso.

## 11. Validação de formulário

- Validar no **blur** e no **submit**, não a cada tecla (exceto força de senha/limite
  de caracteres, que informam ao vivo sem bloquear).
- Erro aparece abaixo do campo, com `aria-invalid` + `aria-describedby`, foco vai ao
  primeiro campo inválido no submit.
- Botão de envio não fica desabilitado "mudo": se algo falta, explica ao tentar.

## 12. Estados otimistas e reconciliação

- Ações seguras (favoritar, reordenar, salvar rascunho) refletem imediatamente.
- Em falha, reverte visivelmente + toast "Não foi possível salvar. Tentar novamente."
- Conflito (edição concorrente): mostra "Alguém atualizou isto" com opção de ver a
  versão nova antes de sobrescrever (ver EDGE_CASES.md).

## 13. Atalhos de teclado (globais)

| Atalho              | Ação                                      |
| ------------------- | ----------------------------------------- |
| `⌘K` / `Ctrl+K`     | Busca global                              |
| `Esc`               | Fechar overlay / cancelar                 |
| `Enter`             | Ativar ação primária focada / confirmar   |
| `/`                 | Focar busca local da tela (quando houver) |
| `Tab` / `Shift+Tab` | Navegar foco                              |
| setas               | Navegar menus, tabs, listas, grade        |

Atalhos nunca são o **único** caminho; toda ação tem alvo clicável.

## 14. Reduced motion

Quando `prefers-reduced-motion: reduce`: trocar deslocamentos/escalas por
fade curto ou transição instantânea; sem parallax, sem shimmer agressivo, sem
auto-animações. Ver MOTION_GUIDE.md.
