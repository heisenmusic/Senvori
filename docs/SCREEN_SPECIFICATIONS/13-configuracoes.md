# 13 · Configurações

## 1. Objetivo

Definir como a empresa funciona na Senvori (perfil, marcas, idiomas, preferências),
sem expor nada técnico e com mudanças reversíveis por padrão.

## 2. Persona & pergunta

Diretor de Marketing: "Como minha empresa está configurada aqui, e o que posso ajustar?"

## 3. Rota & navegação

- Rota `/[locale]/config`. Nav primária #7.
- Seções (subrotas): Perfil da empresa · Marcas · Idiomas · Preferências.
- Breadcrumb: `Configurações › {seção}`.

## 4. Dados exibidos

- **Perfil da empresa:** nome, logo, dados básicos.
- **Marcas:** lista de marcas da empresa (nome, cor/identidade).
- **Idiomas:** idioma padrão + idiomas ativos (pt-BR/en-US/es-ES).
- **Preferências:** som base padrão, fuso, notificações, tema.
- Fonte: Tenancy settings via SDK.

## 5. KPIs / métricas

Nenhum (tela de configuração).

## 6. Ações

- **Primária (por seção):** "Salvar" (aparece com mudança; salva com undo).
- **Secundárias:** adicionar/editar marca, ativar idioma, definir som base.

## 7. Permissões

Cada seção só aparece com permissão de leitura correspondente; salvar exige a
permissão de escrita da seção (senão campos em leitura).

## 8. Estados

- **Loading:** skeleton dos campos.
- **Salvar:** habilita só com mudança; "Preferências salvas" (undo).
- **Confirmação:** mudança estrutural (ex.: renomear marca usada em campanhas
  ativas) confirma com alcance.
- **Sem permissão:** seção/campos em leitura; ações ocultas.
- **Erro/Offline:** padrão global; não perde o que foi digitado.

## 9. Responsividade

Navegação de seções lateral em desktop, seletor no topo em mobile. Formulários em
uma coluna em mobile.

## 10. Acessibilidade

Cada seção com heading; campos com Label; mudança de tema respeita preferência do
sistema; salvar anuncia resultado (`aria-live`).

## 11. Critérios de aceite

- [ ] Seções conforme permissão; salvar só com mudança.
- [ ] Mudança estrutural confirma com alcance; demais têm undo.
- [ ] Idiomas/som base configuráveis; nada de termo técnico.
- [ ] Erro/offline não perdem entrada; a11y AA.

## 12. Dependências

Tenancy settings (parcial), `Stack`, formulários, `Toast`, `Dialog`. Marcas/idiomas
influenciam telas de conteúdo e campanhas.
