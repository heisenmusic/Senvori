# Screen Specifications — Índice

> Uma especificação por tela. Cada spec é **completa e congelada**: um engenheiro
> implementa sem tomar nenhuma decisão de produto. Todas seguem o mesmo gabarito.

## Gabarito de cada spec

1. **Objetivo** — a decisão que a tela ajuda a tomar.
2. **Persona & pergunta** — o que o Diretor de Marketing pergunta aqui.
3. **Rota & navegação** — URL, breadcrumb, de onde se chega.
4. **Dados exibidos** — campos, fonte (SDK/domínio).
5. **KPIs / métricas** — quando houver.
6. **Ações primárias / secundárias** — com permissão exigida.
7. **Permissões** — o que cada papel vê/faz.
8. **Estados** — loading, vazio, sem resultado, erro, sem permissão, sessão
   expirada, offline, sucesso.
9. **Responsividade** — mobile → desktop.
10. **Acessibilidade** — específico da tela (além do piso global).
11. **Critérios de aceite** — checklist objetivo.
12. **Dependências** — backend, componentes, outras telas.

## Telas (por fase de implementação)

| #   | Tela                         | Arquivo                     | Fase | Backend             |
| --- | ---------------------------- | --------------------------- | ---- | ------------------- |
| 01  | Login                        | `01-login.md`               | 1    | ✅ auth             |
| 02  | Início (Centro de Comando)   | `02-inicio.md`              | 1    | agrega              |
| 03  | Biblioteca (lista)           | `03-biblioteca.md`          | 1    | ✅ catalog          |
| 04  | Adicionar conteúdo (envio)   | `04-adicionar-conteudo.md`  | 1    | ✅ catalog          |
| 05  | Conteúdo :id (detalhe)       | `05-conteudo-detalhe.md`    | 1    | ✅ catalog          |
| 06  | Campanhas (lista)            | `06-campanhas.md`           | 1    | ⏳ próximo          |
| 07  | Nova campanha (assistente)   | `07-campanha-assistente.md` | 1    | ⏳ próximo          |
| 08  | Campanha :id (detalhe/prova) | `08-campanha-detalhe.md`    | 1    | ⏳ próximo          |
| 09  | Programação                  | `09-programacao.md`         | 1    | ⏳ próximo          |
| 10  | Lojas (lista)                | `10-lojas.md`               | 2    | ✅ units / ⏳ fleet |
| 11  | Loja :id (loja viva)         | `11-loja-detalhe.md`        | 2    | ✅ units / ⏳ fleet |
| 12  | Equipe                       | `12-equipe.md`              | 2    | ✅ identity         |
| 13  | Configurações                | `13-configuracoes.md`       | 2    | ✅ parcial          |

Telas de Fase 3–4 (Analytics, Retail Media, Marketplace, Copilot) serão
especificadas quando entrarem no roadmap (ver IMPLEMENTATION_ROADMAP.md).
