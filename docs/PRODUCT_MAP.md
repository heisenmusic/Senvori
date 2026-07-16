# Product Map — Visão Completa da Plataforma

> Mapa de todos os módulos, telas, fluxos e relacionamentos. Fonte de verdade da
> estrutura do produto. Cada tela tem uma especificação em `SCREEN_SPECIFICATIONS/`.

## 1. Módulos × estado de fundação

| Módulo (produto)                       | Domínio técnico                        | Backend pronto?               | Fase de UI |
| -------------------------------------- | -------------------------------------- | ----------------------------- | ---------- |
| Início (Centro de Comando)             | agrega Tenancy/Catalog/Fleet/Campaigns | agrega existentes             | Fase 1     |
| Biblioteca                             | Catalog                                | ✅ pronto                     | Fase 1     |
| Campanhas                              | Campaigns                              | ⏳ próximo backend            | Fase 1     |
| Programação                            | Scheduling/Playlists                   | ⏳ próximo backend            | Fase 1     |
| Lojas                                  | Tenancy (units) + Fleet                | ✅ parcial (units) / ⏳ fleet | Fase 2     |
| Equipe                                 | Identity                               | ✅ pronto                     | Fase 2     |
| Configurações                          | Tenancy settings                       | ✅ parcial                    | Fase 2     |
| Analytics / Retail Media / Marketplace | respectivos                            | ⏳                            | Fase 3     |
| IA / Insights / Copilot                | camada transversal                     | ⏳                            | Fase 4     |

## 2. Mapa de telas (árvore)

```
Público
  └─ Login

Autenticado (shell: sidebar + topo + área)
  ├─ Início                    → cartões de prioridade, KPIs, insight de IA, alertas
  ├─ Biblioteca
  │    ├─ Lista (cards)
  │    ├─ Adicionar conteúdo (painel de envio)
  │    └─ Conteúdo :id (detalhe + edição de metadados)
  ├─ Campanhas
  │    ├─ Lista
  │    ├─ Nova (assistente 7 etapas)
  │    └─ Campanha :id (detalhe + prova de veiculação)
  ├─ Programação
  │    ├─ Visão (calendário/regras)
  │    └─ Regra :id (editor de regra)
  ├─ Lojas
  │    ├─ Lista (mapa/lista)
  │    └─ Loja :id (loja viva)
  ├─ Equipe
  │    ├─ Lista (pessoas + papéis)
  │    └─ Convidar pessoa
  └─ Configurações (perfil da empresa, marcas, idiomas, preferências)
```

## 3. Fluxos principais e relacionamentos

```
Conteúdo (Biblioteca) ──alimenta──► Campanhas ──gera──► Programação ──executa──► Lojas
        ▲                                                                    │
        └──────────────── prova de veiculação / uso ◄────────────────────────┘

IA (transversal) observa tudo e sugere ação em: Início, Campanhas, Programação, Lojas.
Equipe/Permissões (transversal) filtra o que cada pessoa vê e pode fazer em todo lugar.
```

### Dependências de fluxo

- **Campanha** consome Conteúdo `pronto` da Biblioteca e define **onde** (lojas) e
  **quando** (período) — produz entradas de Programação.
- **Programação** transforma regras + campanhas no que toca em cada loja/momento;
  garante que nenhuma loja fique muda (fallback som base).
- **Lojas** mostram a execução real (o que toca agora, sincronização, alertas) e
  devolvem prova.
- **Início** é a projeção priorizada de tudo isso.

## 4. Shell da aplicação (comum a todas as telas autenticadas)

- **Sidebar** (nav primária + seletor de empresa + usuário) — ver IA.
- **Barra de topo por tela**: título + subtítulo, busca, ação primária, avatar.
- **Área de conteúdo**: `aria-live="polite"` para estados; largura máxima confortável.
- **Guarda de sessão**: sem sessão → `/login`; sem permissão no destino → mensagem
  "sem permissão"; sessão expira em uso → volta ao ponto após login.

## 5. Estados globais (presentes em toda tela — ver EDGE_CASES / PRODUCT_RULES)

Carregando (skeleton) · Vazio (útil) · Sem resultado de busca · Erro (com próxima
ação) · Sem permissão · Sessão expirada · Offline/reconectando · Sincronizando ·
Preparando conteúdo · Sucesso (com undo quando aplicável).

## 6. Relacionamento com o backend (sem vazar termo técnico na UI)

Toda tela consome o **@senvori/sdk** (auth, identity, tenancy, catalog; campaigns
e scheduling nas próximas sprints). Nomes de produto na UI; nomes técnicos apenas
no SDK/contracts. Ver IMPLEMENTATION_GUIDE.md.
