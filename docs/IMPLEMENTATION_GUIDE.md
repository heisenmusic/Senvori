# Implementation Guide — Do Documento ao Código

> Handoff para engenharia. **A documentação é a verdade** (Princípio 10): em
> conflito entre código e docs, os docs vencem — ajusta-se o código ou registra-se
> uma decisão no PRODUCT_DECISION_LOG.md. Este guia diz **onde** cada decisão já
> tomada vive, para que ninguém decida produto ao codar.

## 1. Ordem de leitura obrigatória (antes de escrever qualquer tela)

1. `PRODUCT_PHILOSOPHY.md` — por que o produto existe e como se comporta.
2. `PRODUCT_LANGUAGE.md` — como se fala (proibido jargão).
3. `INFORMATION_ARCHITECTURE.md` — navegação/rotas congeladas.
4. `PRODUCT_MAP.md` — módulos, telas e fluxos.
5. `DESIGN_SYSTEM_SPEC.md` + `COMPONENT_LIBRARY.md` — como se constrói.
6. `SCREEN_SPECIFICATIONS/<tela>.md` — a tela específica.
7. `PRODUCT_RULES.md` + `EDGE_CASES.md` — comportamento e limites.
8. `INTERACTION_GUIDE.md` + `MOTION_GUIDE.md` + `ACCESSIBILITY_GUIDE.md` — detalhe.
9. `UX_COPY_GUIDE.md` — os textos exatos.
10. `PRODUCT_QA_CHECKLIST.md` — o que valida "pronto".

## 2. Onde cada decisão já está tomada

| Se você for decidir…              | Não decida. Leia…                      |
| --------------------------------- | -------------------------------------- |
| Um nome de menu/rota              | INFORMATION_ARCHITECTURE §1–2          |
| Um rótulo/texto/erro              | UX_COPY_GUIDE + PRODUCT_LANGUAGE       |
| Uma cor/espaço/raio/sombra/fonte  | DESIGN_SYSTEM_SPEC                     |
| Qual componente usar              | COMPONENT_LIBRARY                      |
| Um estado (vazio/erro/loading)    | SCREEN_SPECIFICATIONS + EDGE_CASES     |
| Confirmar vs. undo                | INTERACTION_GUIDE §6–7 + PRODUCT_RULES |
| Uma animação                      | MOTION_GUIDE (catálogo §2)             |
| Uma regra de foco/ARIA/contraste  | ACCESSIBILITY_GUIDE                    |
| Quando algo aparece/some/bloqueia | PRODUCT_RULES                          |

Se a resposta não estiver em nenhum: **pare e abra uma decisão** (§7), não improvise.

## 3. Arquitetura de referência (o que já existe)

- **Monorepo** Turborepo + pnpm. Apps: `apps/api` (NestJS/Fastify), `apps/dashboard`
  (Next.js 15), `apps/site`. Pacotes: `@senvori/contracts` (Zod), `@senvori/sdk`
  (clients tipados), `@senvori/ui` (componentes + tokens), i18n.
- **Backend:** PostgreSQL 16 + Drizzle, **RLS FORCE** com role `NOBYPASSRLS`,
  `withTenantContext()` por transação, auditoria transacional (`recordInTx`), RBAC
  `domain:resource:action` com escopo hierárquico deny-by-default, Better Auth
  (organization plugin; memberships são a verdade).
- **Catálogo:** StorageProvider (local FS + R2/S3), endpoint de blob assinado (HMAC),
  máquina de estados upload→confirm→process, worker de preparação tenant-scoped.
- **Dashboard:** next-intl (pt-BR/en-US/es-ES), TanStack Query, componentes `@senvori/ui`.

## 4. Regras de implementação inegociáveis

1. **Nomes de produto na UI; nomes técnicos só no SDK/contracts.** A tela nunca diz
   "asset", "tenant", "upload", "JWT".
2. **Componentes consomem tokens** (DESIGN_SYSTEM_SPEC); nada de hex/px cru.
3. **Toda tela implementa todos os estados** listados na sua spec (§8 de cada spec).
4. **Undo por padrão; confirmação só destrutivo/irreversível/grande alcance.**
5. **Escopo/tenant sempre respeitado** — a UI nunca oferece o que o backend negaria
   (deny-by-default); nunca vaza dado de outra empresa (RLS).
6. **i18n:** toda string em catálogo (pt-BR canônico); nada hardcoded/Lorem.
7. **a11y AA é critério de aceite**, não polimento posterior.
8. **A marca nunca fica muda:** onde houver programação, fallback som base.

## 5. Contrato entre camadas

- **UI → SDK → API → DB.** A UI só fala com `@senvori/sdk`; nunca chama endpoint
  cru. Tipos vêm de `@senvori/contracts` (Zod). Novo campo de tela = novo campo no
  contrato primeiro.
- **Erros** sobem como código técnico no backend e **viram texto de produto** na UI
  (mapa em UX_COPY_GUIDE §4). Nunca vazar `500`/stack/JWT para a tela.
- **Permissões:** a UI checa capacidade para **mostrar/ocultar**; o backend é a
  autoridade que **autoriza**. Ocultar não é segurança — é UX; a barreira real é o RBAC/RLS.

## 6. Definition of Done por tela

Uma tela está pronta quando:

1. Segue a spec da tela ponto a ponto (dados, ações, permissões, estados, responsividade).
2. Passa o PRODUCT_QA_CHECKLIST (A–J), incluindo a pergunta-persona (J).
3. Usa só componentes da COMPONENT_LIBRARY e tokens do DESIGN_SYSTEM_SPEC.
4. Textos vêm do UX_COPY_GUIDE nos 3 locales.
5. a11y AA verificada (teclado, foco, contraste, leitor de tela, reduced-motion).
6. Edge cases da tela cobertos.
7. Testado (unit/integração conforme a camada; padrão de testes das sprints anteriores).

## 7. Como abrir uma decisão (quando algo não está especificado)

1. Não improvise na tela.
2. Registre em `PRODUCT_DECISION_LOG.md`: contexto, alternativas, escolha,
   justificativa (à luz da persona), impacto, data, responsável.
3. Atualize o documento congelado afetado (IA/design/copy/rules) — a doc continua
   sendo a verdade.
4. Só então implemente.

## 8. Convenções do repositório (já em vigor)

- Commits: Conventional Commits; escopos válidos incluem `api, dashboard, site,
contracts, ui, i18n, sdk, infra, docs, deps, repo` (commitlint). Docs deste sprint
  usam escopo `docs`.
- Lint/format padronizados; testes de integração rodam contra Postgres real.
- Migrations Drizzle versionadas; nunca alterar migração já aplicada.
