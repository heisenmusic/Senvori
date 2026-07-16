# 09 · Programação

## 1. Objetivo

Definir e visualizar o que toca em cada momento, garantindo que **nenhuma loja
fique muda** (fallback som base) e antecipando lacunas e conflitos.

## 2. Persona & pergunta

Diretor de Marketing: "O que toca em cada loja/horário, e há algum buraco?"

## 3. Rota & navegação

- Rota `/[locale]/programacao`. Nav primária #4.
- Regra: `/[locale]/programacao/[id]` — breadcrumb `Programação › {regra}`.

## 4. Dados exibidos

- **Grade** dia/hora × loja/grupo, resolvendo regras + campanhas ativas.
- Lacunas destacadas; conflitos sinalizados; som base como piso.
- Fonte: Scheduling/Playlists + Campaigns via SDK.

## 5. KPIs / métricas

Cobertura ("100% coberto" / "14 lojas com lacuna sexta 14h"), conflitos abertos.

## 6. Ações

- **Primária (contextual):** "Preencher lacuna" / "Resolver conflito".
- **Secundárias:** criar/editar regra, mover regra (undo), definir prioridade,
  escolher som base.

## 7. Permissões

`scheduling:read` para ver; `scheduling:manage` para editar; escopo limita quais
lojas/grupos o usuário programa.

## 8. Estados

- **Loading:** skeleton da grade.
- **Lacuna:** faixa/realce + "14 lojas sem programação sexta 14h" + preencher.
- **Conflito:** "Duas regras disputam o mesmo horário em 8 lojas. Escolha qual vale."
- **Tudo coberto:** confirmação calma ("Nenhuma loja fica muda").
- **Bloqueio:** não salva conflito silencioso nem regra que deixaria loja muda.
- **Mudança que afeta o agora:** confirma com alcance; prévia.
- **Erro/Offline:** padrão global.

## 9. Responsividade

Grade rola dentro de contêiner próprio (`overflow-x:auto`) — página nunca rola na
horizontal. Em mobile, foca um dia/grupo por vez com seletor.

## 10. Acessibilidade

Grade com cabeçalhos semânticos e `aria` de posição; lacuna/conflito por cor+ícone+
texto; alternativa por teclado para mover regras (sem depender de drag).

## 11. Critérios de aceite

- [ ] Nenhuma loja fica muda (som base como piso garantido).
- [ ] Lacunas futuras alertadas proativamente com ação.
- [ ] Conflitos exigem escolha; nunca salvam silenciosamente.
- [ ] Mudança que afeta o que toca agora confirma com alcance.
- [ ] Grade não força scroll horizontal de página; a11y AA.

## 12. Dependências

Scheduling API (próxima sprint), Campaigns, `ScheduleGrid`, `Alert`, `Dialog`.
Telas 07/08 (campanhas), 10/11 (lojas).
