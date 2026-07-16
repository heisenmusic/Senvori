# Senvori — Especificação de Produto (Índice Mestre)

> **Esta sprint (05A) não cria código. Cria a especificação definitiva da Senvori.**
> Objetivo: congelar o produto para que qualquer engenheiro o construa **sem tomar
> nenhuma decisão de produto**. Em conflito entre código e documentação, **a
> documentação é a verdade** (Princípio Fundador 10).
>
> Persona única em toda decisão: _"Isso facilita a vida de um Diretor de Marketing
> de uma rede com centenas ou milhares de lojas?"_

## O que é a Senvori

A central operacional da experiência da marca em todas as lojas de uma rede — de
onde um Diretor de Marketing decide como a marca **soa, comunica e se sente** em
centenas ou milhares de pontos ao mesmo tempo. Não é software de rádio, painel de
TI nem AutoDJ.

## Mapa dos documentos (a ordem de leitura é esta)

| Fase | Documento                                                    | O que congela                                                         |
| ---- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1    | [PRODUCT_PHILOSOPHY.md](./PRODUCT_PHILOSOPHY.md)             | A Constituição: valores, comportamento, sensações, princípios.        |
| 2    | [PRODUCT_LANGUAGE.md](./PRODUCT_LANGUAGE.md)                 | O dicionário oficial (técnico→produto), sem jargão.                   |
| 3    | [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md) | Menus, rotas, breadcrumbs, busca, filtros — congelados.               |
| 4    | [PRODUCT_MAP.md](./PRODUCT_MAP.md)                           | Módulos, telas, fluxos e relacionamentos.                             |
| 5    | [SCREEN_SPECIFICATIONS/](./SCREEN_SPECIFICATIONS/README.md)  | Uma spec completa por tela (13 telas).                                |
| 6    | [COMPONENT_LIBRARY.md](./COMPONENT_LIBRARY.md)               | Todos os componentes: uso, variantes, estados, a11y.                  |
| 7    | [DESIGN_SYSTEM_SPEC.md](./DESIGN_SYSTEM_SPEC.md)             | Cores, spacing, grid, raio, sombras, tipografia, motion, breakpoints. |
| 8    | [UX_COPY_GUIDE.md](./UX_COPY_GUIDE.md)                       | Todos os textos (pt-BR/en-US/es-ES), sem Lorem.                       |
| 9    | [INTERACTION_GUIDE.md](./INTERACTION_GUIDE.md)               | Hover, foco, clique, loading, undo, drag, scroll.                     |
| 10   | [MOTION_GUIDE.md](./MOTION_GUIDE.md)                         | Cada animação: duração, curva, propósito.                             |
| 11   | [ACCESSIBILITY_GUIDE.md](./ACCESSIBILITY_GUIDE.md)           | WCAG AA, teclado, foco, ARIA, contraste, zoom, leitor de tela.        |
| 12   | [PRODUCT_RULES.md](./PRODUCT_RULES.md)                       | Por tela: aparece/some/bloqueia/habilita/confirma/desfaz.             |
| 13   | [EDGE_CASES.md](./EDGE_CASES.md)                             | Offline, sessão, conflito, inválido, vencido, vazio, duplicidade.     |
| 14   | [PRODUCT_QA_CHECKLIST.md](./PRODUCT_QA_CHECKLIST.md)         | O checklist que define "pronto".                                      |
| 15   | [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)         | Handoff para engenharia, sem ambiguidade.                             |
| 16   | [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)     | Fases 1–4: objetivo, dependências, aceite, riscos.                    |
| —    | [PRODUCT_DECISION_LOG.md](./PRODUCT_DECISION_LOG.md)         | Toda decisão congelada, com justificativa.                            |

## Como usar (engenharia)

1. Ler na ordem acima antes de tocar em código.
2. Para uma tela: `SCREEN_SPECIFICATIONS/<tela>.md` + PRODUCT_RULES + EDGE_CASES +
   UX_COPY_GUIDE + COMPONENT_LIBRARY + DESIGN_SYSTEM_SPEC.
3. Validar com PRODUCT_QA_CHECKLIST (A–J).
4. Decisão faltando? **Não improvise:** abra entrada no PRODUCT_DECISION_LOG e
   atualize o doc congelado (IMPLEMENTATION_GUIDE §7).

---

## Auditoria final (obrigatória nesta sprint)

**Pergunta:** _sobra alguma decisão de UX, Design, Produto, linguagem ou componente
em aberto para o que será construído nas Fases 1–2?_

| Área                            | Alguma decisão de produto em aberto? | Onde foi resolvida                                 |
| ------------------------------- | ------------------------------------ | -------------------------------------------------- |
| Filosofia/valores               | Não                                  | PRODUCT_PHILOSOPHY                                 |
| Linguagem/termos                | Não                                  | PRODUCT_LANGUAGE (dicionário + estados + direitos) |
| Navegação/rotas/busca/filtros   | Não                                  | INFORMATION_ARCHITECTURE (congelada)               |
| Módulos/telas/fluxos            | Não                                  | PRODUCT_MAP + SCREEN_SPECIFICATIONS (13 telas)     |
| Componentes                     | Não                                  | COMPONENT_LIBRARY (uso/variantes/estados/a11y)     |
| Design (cor/espaço/tipo/motion) | Não                                  | DESIGN_SYSTEM_SPEC (tokens reais)                  |
| Textos                          | Não                                  | UX_COPY_GUIDE (3 locales, sem Lorem)               |
| Interação/undo/confirmação      | Não                                  | INTERACTION_GUIDE + PRODUCT_RULES                  |
| Movimento                       | Não                                  | MOTION_GUIDE (catálogo fechado)                    |
| Acessibilidade                  | Não                                  | ACCESSIBILITY_GUIDE (AA piso)                      |
| Regras por tela                 | Não                                  | PRODUCT_RULES                                      |
| Edge cases                      | Não                                  | EDGE_CASES                                         |
| Critérios de "pronto"           | Não                                  | PRODUCT_QA_CHECKLIST                               |

**Itens ainda abertos:** apenas de **backend/dados** para Fases 3–4 (métricas de
Analytics/Retail Media, modelo de automações da IA, telas de Marketplace) — cada um
com dono e gatilho no PRODUCT_DECISION_LOG. **Nenhuma decisão de UX/Design/
Produto/linguagem/componente das Fases 1–2 permanece em aberto.**

---

## A pergunta final

> _"Se amanhã a equipe crescer de 2 para 50 engenheiros, todos conseguiriam
> construir a mesma Senvori apenas lendo esta documentação?"_

**SIM.** Fundamentação:

1. **Há uma verdade única e priorizada.** Filosofia (por quê) → Linguagem (como se
   fala) → IA/Mapa (o quê e onde) → Design System/Componentes (com o quê) → Specs de
   tela (o detalhe) → Regras/Edge/Interação/Motion/A11y (o comportamento) → Copy (as
   palavras) → QA (o aceite) → Guide/Roadmap (a ordem). A ordem de leitura elimina
   ambiguidade sobre onde cada decisão vive.

2. **Nenhuma decisão de produto foi deixada para o momento de codar.** Para cada
   pergunta que um engenheiro faria (nome de menu, cor, texto, estado vazio, confirmar
   ou desfazer, qual componente, qual animação), o IMPLEMENTATION_GUIDE §2 aponta o
   documento que já respondeu. Onde nada respondeu, o processo obriga a abrir uma
   decisão registrada — não a improvisar.

3. **Os valores são reais, não inventados.** Design System, componentes e rotas estão
   ancorados no que já existe no repositório (`packages/ui/tokens.ts`, `styles.css`,
   componentes exportados, contratos `@senvori/*`, RBAC, RLS), garantindo que a doc
   descreve a Senvori construível, não uma hipotética.

4. **Consistência é imposta, não sugerida.** Um acento, uma escala de espaço, um
   catálogo fechado de animações, uma biblioteca de componentes proibindo invenção na
   tela, um dicionário proibindo jargão, um checklist de aceite com a pergunta-persona.
   Cinquenta pessoas seguindo estes trilhos convergem para o mesmo produto.

5. **O crescimento tem processo.** Escalar não corrompe a spec: toda mudança passa
   pelo PRODUCT_DECISION_LOG e atualiza o documento congelado, mantendo a doc como
   fonte de verdade mesmo com muitas mãos.

**Conclusão:** a documentação está congelada, ancorada no código real e completa para
as Fases 1–2, com um processo explícito para as Fases 3–4. Uma equipe de 50 pessoas
construiria **a mesma Senvori** lendo estes documentos.
