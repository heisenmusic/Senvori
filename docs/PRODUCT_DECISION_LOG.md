# Product Decision Log

> Registro de toda decisão de produto que congela algo. Cada entrada:
> **contexto · alternativas · decisão · justificativa (à luz da persona) · impacto ·
> data · responsável.** Mudar um documento congelado exige uma entrada nova aqui.
> Persona-guia: _"Isso facilita a vida de um Diretor de Marketing de uma rede com
> centenas ou milhares de lojas?"_

Formato de ID: `PD-YYYYMMDD-NN`.

---

### PD-20260716-01 — Linguagem de produto sem termos técnicos

- **Contexto:** a superfície tende a herdar nomes do backend (tenant, asset, upload).
- **Alternativas:** (a) usar termos técnicos; (b) traduzir só alguns; (c) dicionário
  completo técnico→produto obrigatório.
- **Decisão:** (c). Ver PRODUCT_LANGUAGE.md.
- **Justificativa:** o Diretor de Marketing pensa em "conteúdo/loja/campanha", não em
  "asset/unit/tenant". Jargão quebra confiança e velocidade.
- **Impacto:** todas as telas, textos e i18n.
- **Data/Responsável:** 2026-07-16 / Product (05A).

### PD-20260716-02 — Navegação por prioridade, não alfabética

- **Contexto:** ordenar menus e listas.
- **Alternativas:** alfabética; por data; por prioridade/urgência.
- **Decisão:** por prioridade de decisão do Diretor de Marketing (nav) e por
  urgência (listas). Ver INFORMATION_ARCHITECTURE §1 e §6.
- **Justificativa:** o que precisa de atenção deve vir primeiro (regra dos 5s).
- **Impacto:** sidebar, Início, Campanhas, Lojas, Equipe.
- **Data/Responsável:** 2026-07-16 / Product.

### PD-20260716-03 — Undo por padrão, confirmação por exceção

- **Contexto:** evitar tanto perda acidental quanto excesso de diálogos.
- **Alternativas:** confirmar tudo; nunca confirmar; undo padrão + confirmar só
  destrutivo/irreversível/grande alcance.
- **Decisão:** a terceira. Ver INTERACTION_GUIDE §6–7.
- **Justificativa:** confirmação em excesso mata velocidade e treina o "OK" cego;
  undo dá segurança sem atrito.
- **Impacto:** todas as ações de escrita.
- **Data/Responsável:** 2026-07-16 / Product+UX.

### PD-20260716-04 — A marca nunca fica muda (fallback som base)

- **Contexto:** lacuna de programação poderia gerar silêncio na loja.
- **Alternativas:** deixar mudo; repetir última; **som base** como piso garantido.
- **Decisão:** som base sempre. Ver PRODUCT_PHILOSOPHY §4/§5, PRODUCT_RULES §9,
  EDGE_CASES §5.
- **Justificativa:** silêncio numa loja é falha de marca inaceitável.
- **Impacto:** Programação, Lojas, Campanhas (encerramento/lacuna).
- **Data/Responsável:** 2026-07-16 / Product.

### PD-20260716-05 — Acento único de marca (índigo-violeta, hue 285)

- **Contexto:** identidade visual e uso de cor.
- **Alternativas:** múltiplos acentos; paleta ampla; **um** acento + neutros + semânticas.
- **Decisão:** um acento (marca só em primária/foco/ativo), neutros contidos (hue
  260), semânticas com significado. Ver DESIGN_SYSTEM_SPEC §1.
- **Justificativa:** elegância = precisão sem ruído; norte Linear/Stripe/Notion.
- **Impacto:** todo o design system e componentes.
- **Data/Responsável:** 2026-07-16 / Design System.

### PD-20260716-06 — Cor em oklch + dark mode por tokens semânticos

- **Contexto:** garantir contraste consistente e dark mode sem manutenção dupla.
- **Alternativas:** hex/hsl + dois conjuntos de cor; **oklch + tokens semânticos**.
- **Decisão:** oklch; dark mode sobrescreve só tokens de superfície. Ver
  DESIGN_SYSTEM_SPEC §1.4–1.5.
- **Justificativa:** um só sistema, contraste previsível, componentes não mudam.
- **Impacto:** tokens, componentes, a11y.
- **Data/Responsável:** 2026-07-16 / Design System.

### PD-20260716-07 — Movimento só com propósito

- **Contexto:** risco de animação decorativa.
- **Alternativas:** animar livremente; catálogo fechado de animações justificadas.
- **Decisão:** catálogo fechado + reduced-motion obrigatório. Ver MOTION_GUIDE.
- **Justificativa:** movimento deve ensinar (estado/continuidade), não distrair;
  acessibilidade.
- **Impacto:** todas as interações.
- **Data/Responsável:** 2026-07-16 / UX+Design.

### PD-20260716-08 — Direitos em linguagem segura

- **Contexto:** a plataforma não verifica legalidade de direitos.
- **Alternativas:** afirmar "licenciado/livre de royalties"; **linguagem declarativa** segura.
- **Decisão:** só "informação declarada pelo responsável"/"não verificados"/
  "documentação pendente"; "aprovado para uso" só após workflow explícito. Ver
  PRODUCT_LANGUAGE §3.
- **Justificativa:** proteger a empresa e o produto de afirmação jurídica indevida.
- **Impacto:** Biblioteca, Conteúdo detalhe, envio.
- **Data/Responsável:** 2026-07-16 / Product+Legal-aware.

### PD-20260716-09 — WCAG AA como piso, não meta

- **Contexto:** acessibilidade como critério, não polimento.
- **Alternativas:** "quando der"; AA como critério de aceite.
- **Decisão:** AA obrigatório por tela/componente. Ver ACCESSIBILITY_GUIDE e
  PRODUCT_QA_CHECKLIST §E.
- **Justificativa:** produto para todos; princípio fundador 8.
- **Impacto:** todas as telas e componentes.
- **Data/Responsável:** 2026-07-16 / UX+Accessibility.

### PD-20260716-10 — Rotas canônicas em pt-BR sob `/[locale]`

- **Contexto:** URLs multilíngues.
- **Alternativas:** rotas em inglês; rotas traduzidas por locale; **pt-BR canônico
  sob `/[locale]`**.
- **Decisão:** pt-BR canônico (`/inicio`, `/biblioteca`…) com prefixo de locale. Ver
  INFORMATION_ARCHITECTURE §7.
- **Justificativa:** consistência e simplicidade; pt-BR é o idioma-base do produto.
- **Impacto:** roteamento, i18n, links.
- **Data/Responsável:** 2026-07-16 / Product+Eng.

### PD-20260716-11 — Especificação congela o produto antes do código (Sprint 05A)

- **Contexto:** crescer de 2 para 50 engenheiros sem divergência de produto.
- **Alternativas:** decidir produto durante a implementação; **congelar a spec
  primeiro**.
- **Decisão:** este conjunto de documentos é a verdade; engenharia implementa sem
  decidir produto (ver IMPLEMENTATION_GUIDE §7 para o processo de exceção).
- **Justificativa:** uma só Senvori, independentemente de quem constrói.
- **Impacto:** todo o processo de desenvolvimento.
- **Data/Responsável:** 2026-07-16 / CPO/Product.

---

## Decisões deixadas explicitamente em aberto (com dono e gatilho)

Nenhuma decisão de **UX, design, linguagem, componente ou fluxo** permanece aberta
para as telas das Fases 1–2 (ver auditoria em PRODUCT_SPECIFICATION.md §Auditoria).
Itens que dependem de sprints futuras são de **backend/dados**, não de produto:

| Item                                      | Natureza      | Gatilho para especificar    |
| ----------------------------------------- | ------------- | --------------------------- |
| Métricas exatas de Analytics/Retail Media | dados         | Início da Fase 3            |
| Modelo de automações da IA                | produto+dados | Início da Fase 4            |
| Telas de Marketplace                      | produto       | Entrada no roadmap (Fase 3) |

Cada um vira spec completa em `SCREEN_SPECIFICATIONS/` **antes** de implementar,
com nova entrada aqui.
