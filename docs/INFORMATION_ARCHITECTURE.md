# Information Architecture — Congelada

> Menus, hierarquia, navegação, breadcrumbs, busca e filtros estão **congelados**.
> A implementação não pode alterá-los. Alterações exigem uma entrada no
> PRODUCT_DECISION_LOG.md e nova aprovação.

## 1. Navegação primária (sidebar, ordem fixa por intenção)

A ordem é por **frequência de decisão do Diretor de Marketing**, nunca alfabética.

| #   | Destino           | Rota                    | Pergunta que responde               | Ícone (conceito) |
| --- | ----------------- | ----------------------- | ----------------------------------- | ---------------- |
| 1   | **Início**        | `/[locale]/inicio`      | "Como está minha operação agora?"   | painel/pulso     |
| 2   | **Biblioteca**    | `/[locale]/biblioteca`  | "Que conteúdo minha marca tem?"     | onda sonora      |
| 3   | **Campanhas**     | `/[locale]/campanhas`   | "O que comunico e quando?"          | megafone         |
| 4   | **Programação**   | `/[locale]/programacao` | "O que toca em cada momento?"       | calendário       |
| 5   | **Lojas**         | `/[locale]/lojas`       | "Cada loja está no ar e certa?"     | pino de loja     |
| 6   | **Equipe**        | `/[locale]/equipe`      | "Quem pode fazer o quê?"            | pessoas          |
| 7   | **Configurações** | `/[locale]/config`      | "Como minha empresa funciona aqui?" | engrenagem       |

Rodapé da sidebar: seletor de **Empresa** (quando o usuário pertence a mais de
uma), avatar/nome com menu (perfil, idioma, sair). Destinos aparecem apenas se o
usuário tiver permissão de leitura no domínio (ver PRODUCT_RULES.md).

## 2. Hierarquia de rotas e breadcrumbs

```
Início                                   (sem breadcrumb — raiz)
Biblioteca                               Biblioteca
  └ Conteúdo :id                         Biblioteca › {título}
Campanhas                                Campanhas
  └ Nova                                 Campanhas › Nova campanha
  └ Campanha :id                         Campanhas › {nome}
Programação                              Programação
  └ Regra :id                            Programação › {regra}
Lojas                                    Lojas
  └ Loja :id                             Lojas › {loja}
Equipe                                   Equipe
Configurações                            Configurações › {seção}
```

Breadcrumbs aparecem só em telas de detalhe (profundidade ≥ 2). O primeiro nível é
sempre um link para a lista do destino. O último nível é o título do item (texto,
não link).

## 3. Busca

- **Busca global (⌘K / Ctrl+K)** — atravessa Conteúdo, Lojas, Campanhas e ações.
  Resultados agrupados por tipo, com o item mais relevante no topo. Acessível por
  teclado ponta a ponta. Placeholder: "Buscar em tudo".
- **Busca local por tela** — campo `type=search` no topo de cada lista (Biblioteca,
  Campanhas, Lojas), com _debounce_ de 300 ms, buscando pelo campo natural
  (título, nome). Placeholder específico por tela (ver UX_COPY_GUIDE.md).

## 4. Filtros (por tela, congelados)

| Tela        | Filtros oficiais                                                                            |
| ----------- | ------------------------------------------------------------------------------------------- |
| Biblioteca  | Tipo (Música/Locução), Status, Idioma, Origem, Campanha vinculada, Humor/Energia (avançado) |
| Campanhas   | Status (rascunho/agendada/no ar/encerrada), Período, Lojas/Região                           |
| Programação | Dia/horário, Loja/Grupo, Regra                                                              |
| Lojas       | Status (no ar/offline/alerta), Região, Marca, Grupo                                         |
| Equipe      | Papel, Status (ativo/suspenso), Escopo                                                      |

Regras de filtro: (a) filtro nunca some silenciosamente resultados sem indicar o
estado "sem resultados"; (b) filtros aplicados são visíveis como chips removíveis;
(c) estado padrão = mais útil (ex.: Lojas abre priorizando offline/alerta), nunca
alfabético.

## 5. Taxonomia de conteúdo

Tipo primário (visível): **Música**, **Locução/Anúncio**. Distinções finas (spot,
vinheta, jingle, institucional) vivem em **categoria** e **tags**, não em um menu
rígido. Organização opcional por **Coleções** (pastas lógicas) e **Campanha
vinculada**. Nunca expor os tipos técnicos internos (`video/image/signage_bundle`)
nesta fase.

## 6. Agrupamentos e ordenação padrão

- **Início**: por prioridade (crítico → atenção → informação), nunca por data pura.
- **Biblioteca**: cards, ordenação padrão "adicionados recentemente"; opções: mais
  tocados, A–Z.
- **Campanhas**: no ar primeiro, depois agendadas, depois rascunhos, depois
  encerradas.
- **Lojas**: com problema primeiro (offline/alerta), depois no ar.
- **Equipe**: por papel (mais privilegiado primeiro), depois nome.

## 7. Regras de URL e i18n

- Todas as rotas sob `/[locale]/…` com `locale ∈ {pt-BR, en-US, es-ES}`.
- Rotas usam nomes de produto em pt-BR como canônicos (`/inicio`, `/biblioteca`).
- Área autenticada agrupada; `/login` público. Sessão expirada → redireciona a
  `/login` preservando o destino pretendido.
