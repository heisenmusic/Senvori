# Product QA Checklist — Congelado

> Checklist de aceite de produto. Uma tela/feature só é "pronta" quando **todos**
> os itens aplicáveis passam. QA aqui é de produto e experiência (não substitui
> testes de engenharia; complementa). Referências: PRODUCT_PHILOSOPHY, PRODUCT_RULES,
> EDGE_CASES, ACCESSIBILITY_GUIDE.

## A. Regra dos 5 segundos (toda tela)

- [ ] Responde: **onde estou** (título + breadcrumb quando aplicável).
- [ ] Responde: **o que aconteceu** (estado/KPIs/prioridade visíveis).
- [ ] Responde: **o que pede atenção** (crítico→atenção→informação, cor + texto).
- [ ] Responde: **o que posso fazer agora** (uma ação primária clara).

## B. Linguagem (PRODUCT_LANGUAGE)

- [ ] Zero termo técnico na superfície (tenant/asset/upload/JWT/etc.).
- [ ] Botões com verbo de resultado (não "OK"/"Enviar" solto).
- [ ] Erros explicam o que houve + próxima ação, sem apologia vazia.
- [ ] Números com rótulo e comparação; nada de valor cru sem significado.
- [ ] Direitos em linguagem segura (nunca afirma legalidade).
- [ ] Textos existem nos 3 locales (pt-BR/en-US/es-ES); nada hardcoded/Lorem.

## C. Estados (todos presentes e corretos)

- [ ] Carregando (skeleton onde há layout; spinner só indeterminado curto).
- [ ] Vazio útil (primeiro passo, não "nenhum registro").
- [ ] Sem resultado de busca (com limpar filtros).
- [ ] Erro (com "Tentar novamente" / próxima ação).
- [ ] Sem permissão (oculta ação/destino; mensagem no acesso direto).
- [ ] Sessão expirada (preserva destino e retoma).
- [ ] Offline/reconectando (não perde trabalho).
- [ ] Sucesso (feedback + undo quando reversível).

## D. Interação (INTERACTION_GUIDE)

- [ ] 5 estados em todo controle (default/hover/focus-visible/active/disabled).
- [ ] Undo para reversível; confirmação **só** para destrutivo/irreversível/grande alcance.
- [ ] Confirmação mostra o alcance real ("afeta N lojas").
- [ ] Loading em botões que disparam trabalho (sem duplo envio).
- [ ] Validação no blur/submit; foco vai ao primeiro erro.
- [ ] Drag tem alternativa por teclado.
- [ ] Página nunca rola na horizontal (conteúdo largo em contêiner próprio).

## E. Acessibilidade (ACCESSIBILITY_GUIDE — piso AA)

- [ ] Operável 100% por teclado; foco visível sempre.
- [ ] Contraste ≥ AA nos dois esquemas (claro/escuro).
- [ ] Nome acessível e papel correto em cada controle.
- [ ] Estados anunciados (`aria-live`, `aria-busy`, `aria-invalid`, `aria-current`).
- [ ] Nenhum significado só por cor.
- [ ] Zoom 200% e reflow 320px sem quebra.
- [ ] `prefers-reduced-motion` respeitado.
- [ ] Overlays prendem e devolvem foco; `Esc` fecha não destrutivo.
- [ ] `<html lang>` correto; um `<h1>` por tela; headings sem pular nível.

## F. Design system (DESIGN_SYSTEM_SPEC)

- [ ] Só tokens (sem hex/px cru).
- [ ] Um acento (marca só em primária/foco/ativo).
- [ ] Espaçamento na escala 4px; raios corretos por tipo (card `lg`, botão `md`).
- [ ] Elevação com propósito (sombra = hierarquia).
- [ ] Tipografia na escala; hierarquia por tamanho+peso+cor.

## G. Movimento (MOTION_GUIDE)

- [ ] Toda animação está no catálogo permitido e tem propósito.
- [ ] Durações ≤ ~400ms; entra devagar, sai rápido.
- [ ] Nada pisca; nenhum loop que não seja progresso.
- [ ] Reduced-motion troca movimento por fade/instantâneo.

## H. Comportamento e regras (PRODUCT_RULES + EDGE_CASES)

- [ ] Ações aparecem/somem conforme permissão e estado.
- [ ] Ordenação por prioridade, não alfabética.
- [ ] Filtros nunca somem resultado em silêncio; chips removíveis.
- [ ] Edge cases da tela cobertos (offline, sessão, conflito, vazio, inválido, duplicidade).
- [ ] Nenhuma loja fica muda (fallback som base) onde aplicável.
- [ ] Escopo/tenant isolado (nunca vaza dado de outra empresa).

## I. Consistência

- [ ] Mesmo padrão para o mesmo problema em telas diferentes.
- [ ] Componentes vêm da COMPONENT_LIBRARY (nada inventado na tela).
- [ ] Navegação/breadcrumbs conforme INFORMATION_ARCHITECTURE (congelada).

## J. Persona (o teste final)

- [ ] **"Isso facilita a vida de um Diretor de Marketing de uma rede com centenas
      ou milhares de lojas?"** Se não em qualquer ponto → não passa.

---

### Como usar

1. Rodar A–J em cada tela antes de considerá-la pronta.
2. Qualquer `[ ]` não marcado aplicável **bloqueia** o "pronto".
3. Divergência com a documentação: **a documentação vence** (Princípio 10); ajusta-se
   o código ou registra-se uma decisão no PRODUCT_DECISION_LOG.md.
