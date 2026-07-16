# Motion Guide — Cada Animação Justificada

> Regra única: **nunca animamos por estética.** Todo movimento comunica **estado**
> (algo mudou), **continuidade** (de onde para onde) ou **hierarquia** (o que veio
> de onde). Se uma animação não responde "o que isso ensina ao usuário?", ela não
> existe. Durações e curvas são tokens de DESIGN_SYSTEM_SPEC.md §8.

## 1. Tokens de movimento (referência)

**Durações:** `instant` 0 · `fast` 120ms · `base` 200ms · `slow` 320ms. Nada acima
de ~400ms na interface operacional.

**Curvas:** `standard` `cubic-bezier(0.2,0,0,1)` · `decelerate` `cubic-bezier(0,0,0,1)`
(entra) · `accelerate` `cubic-bezier(0.3,0,1,1)` (sai) · `linear` (progresso).

## 2. Catálogo de animações (a única lista permitida)

| #   | Animação                                 | Duração          | Curva      | O que comunica                      |
| --- | ---------------------------------------- | ---------------- | ---------- | ----------------------------------- |
| 1   | Hover de botão/card (cor, sombra)        | `fast` 120       | standard   | "isto é interativo / vai responder" |
| 2   | Press/active (−1 degrau)                 | `instant`–`fast` | standard   | "recebi seu toque"                  |
| 3   | Anel de foco aparecendo                  | `fast` 120       | decelerate | "o teclado está aqui"               |
| 4   | Toast entrando (slide+fade)              | `base` 200       | decelerate | "algo aconteceu"                    |
| 5   | Toast saindo                             | `base` 200       | accelerate | "fim da mensagem"                   |
| 6   | Dropdown/Popover abrindo                 | `base` 200       | decelerate | "menu ancorado neste gatilho"       |
| 7   | Dialog/Modal abrindo (fade+scale 0.98→1) | `slow` 320       | decelerate | "atenção focada aqui"               |
| 8   | Dialog fechando                          | `base` 200       | accelerate | "voltando ao contexto"              |
| 9   | Drawer/painel lateral (slide)            | `slow` 320       | standard   | "de onde vem, para onde volta"      |
| 10  | Transição de página (fade curto)         | `base` 200       | standard   | "mudei de tela"                     |
| 11  | Skeleton shimmer                         | ~1200 loop       | linear     | "estou carregando este bloco"       |
| 12  | ProgressBar de envio                     | linear real      | linear     | "progresso real do envio"           |
| 13  | Spinner indeterminado                    | ~800 loop        | linear     | "aguarde um instante"               |
| 14  | Expand/collapse (altura)                 | `base` 200       | standard   | "revelei/ocultei detalhe"           |
| 15  | Undo desaparecendo (barra de tempo)      | duração do undo  | linear     | "quanto tempo resta para desfazer"  |
| 16  | Item entrando/saindo de lista            | `base` 200       | dec/acc    | "este item chegou/saiu"             |
| 17  | Drag: item eleva (sombra `md`)           | `fast` 120       | standard   | "peguei este item"                  |
| 18  | Drop: item assenta na posição            | `base` 200       | decelerate | "soltei aqui"                       |
| 19  | Número de KPI contando (opcional)        | `slow` 320       | decelerate | "valor atualizado"                  |
| 20  | Realce de mudança (flash sutil)          | `base` 200       | standard   | "este dado mudou agora"             |

**Nada fora desta lista** entra no produto sem uma nova entrada aqui + decisão
registrada.

## 3. Princípios de movimento

1. **Propósito acima de tudo.** Sem animação decorativa, sem parallax, sem
   auto-play, sem loop infinito que não seja indicador de progresso.
2. **Rápido é respeito.** Interações diretas (hover/press/foco) em `fast`; nada que
   faça o usuário esperar a animação terminar para agir.
3. **Origem e destino.** Overlays entram do seu ponto de ancoragem; painéis voltam
   de onde vieram. Continuidade espacial reduz carga cognitiva.
4. **Entra devagar, sai rápido.** `decelerate` ao aparecer, `accelerate` ao sair.
5. **Uma coisa de cada vez.** Evitar múltiplas animações concorrentes competindo
   pela atenção.
6. **Movimento nunca bloqueia.** O usuário pode agir durante/apesar da animação.

## 4. Movimento com significado semântico

- **Progresso** (11–13, 15) é o único movimento contínuo permitido, e sempre
  representa trabalho real ou tempo real.
- **Realce de mudança** (20): quando um dado muda por evento externo (sincronização,
  nova campanha no ar), um flash sutil de `info`/`success` chama o olho — sem som,
  sem exagero.
- **Severidade não pisca.** Alertas críticos usam cor e posição, **não** animação
  intermitente (piscar é distração e problema de acessibilidade).

## 5. `prefers-reduced-motion: reduce`

Obrigatório. Quando ativo:

- Slides/scales viram **fade curto** (`fast`) ou aparição instantânea.
- Shimmer de skeleton vira placeholder estático (sem brilho em movimento).
- Contagem de número (19) e realce de mudança (20) são desligados (valor aparece direto).
- Spinner/ProgressBar continuam (são informação de estado, não decoração), mas sem
  efeitos extras.
- Nenhuma funcionalidade depende de perceber a animação.

## 6. Anti-padrões (proibidos)

1. Animar só porque "fica bonito".
2. Duração > 400ms em fluxo operacional.
3. Loop infinito que não seja progresso.
4. Piscar para chamar atenção.
5. Bloquear a ação do usuário até a animação acabar.
6. Ignorar `prefers-reduced-motion`.
7. Movimento diferente para o mesmo tipo de evento em telas diferentes
   (consistência > novidade).
