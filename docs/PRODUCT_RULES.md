# Product Rules — Regras de Comportamento por Tela

> Para cada tela: **quando algo aparece, quando some, quando bloqueia, quando
> habilita, quando confirma, quando desfaz.** Estas regras são de produto (não de
> implementação) e são congeladas. Permissões referem-se ao RBAC
> `domain:resource:action` (ver `@senvori/contracts/rbac`).

## 0. Regras globais (valem em todas as telas)

| Situação                                    | Regra                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Sem sessão                                  | Redireciona a `/login`, preservando o destino pretendido.                                 |
| Sessão expira em uso                        | Ao voltar, retoma o destino após novo login (nada perdido).                               |
| Sem permissão de leitura no domínio         | O item da sidebar **não aparece**; acesso direto à rota mostra "sem permissão".           |
| Sem permissão de ação                       | O botão da ação **não aparece** (não aparece desabilitado sem explicação).                |
| Ação reversível                             | Executa na hora + **undo** (sem diálogo).                                                 |
| Ação destrutiva/irreversível/grande alcance | **Confirma** com o alcance real antes.                                                    |
| Erro de rede/servidor                       | Estado de erro com próxima ação; nunca código técnico.                                    |
| Offline                                     | Faixa "sem conexão, reconectando"; ações de escrita ficam em espera/bloqueadas com aviso. |
| Carregando                                  | Skeleton (layout conhecido) ou spinner (indeterminado curto).                             |
| Escopo visível                              | Toda ação de alcance mostra "afeta N lojas/…".                                            |

Ordenação padrão sempre por **prioridade/urgência**, nunca alfabética (ver
INFORMATION_ARCHITECTURE §6).

## 1. Login

- **Aparece:** só quando sem sessão. Com sessão válida, `/login` redireciona ao Início.
- **Habilita** "Entrar" com e-mail e senha preenchidos (valida no submit).
- **Bloqueia** novo submit enquanto autentica (loading).
- **Erro** de credencial: mensagem única sem revelar qual campo (UX_COPY_GUIDE §3.1).
- Sem undo/confirmação.

## 2. Início

- **Aparece:** KPIs, cartões de prioridade (crítico→atenção→informação), insight de
  IA (se houver), atalhos rápidos. Saudação contextual.
- **Some:** insight de IA ao ser descartado ("Agora não") ou resolvido.
- **Vazio:** empresa nova → convite a adicionar conteúdo/convidar equipe.
- **Habilita** ação sugerida pela IA só se o usuário tiver permissão para executá-la.
- **Confirma:** só se a ação da IA for de grande alcance (ex.: estender campanha em
  muitas lojas). **Desfaz:** a maioria das ações rápidas do Início tem undo.
- Cartão de problema sempre traz o botão que resolve.

## 3. Biblioteca

- **Aparece:** conteúdo com permissão `catalog:asset:read`. Cards com status.
- **Ação primária** "Adicionar conteúdo" só com `catalog:asset:create`.
- **Habilita** adicionar a campanha apenas conteúdo **Pronto** (não Enviando/Preparando/Falhou).
- **Bloqueia** editar arquivo enquanto **Preparando**; permite editar metadados.
- **Filtro** nunca some resultado em silêncio: mostra "sem resultado" + limpar filtros.
- **Desfaz:** salvar metadado, arquivar (não em uso), mover para coleção → undo.
- **Confirma:** arquivar conteúdo **em uso** por campanha ativa ("Isto sai de N campanhas").
- **Some:** conteúdo arquivado sai da lista padrão; visível em "Arquivados".

## 4. Adicionar conteúdo (envio)

- **Habilita** envio ao escolher/soltar arquivo de tipo aceito.
- **Bloqueia** arquivo de formato inválido (mensagem clara) antes de enviar.
- **Aparece** progresso real por arquivo (Enviando %) → "Preparando" → "Pronto".
- **Falha:** item marcado "Falhou" com "Tentar novamente"; não bloqueia os demais.
- **Desfaz:** conteúdo recém-adicionado tem undo curto (arquiva de volta).
- Não confirma (ação de criação é reversível por arquivamento).

## 5. Conteúdo :id (detalhe)

- **Aparece:** metadados, versões, uso, direitos declarados, ações conforme permissão.
- **Habilita** "Salvar" só quando há mudança (dirty); salva com undo.
- **Bloqueia** "Substituir arquivo" enquanto Preparando.
- **Confirma** "Arquivar" quando em uso; **desfaz** quando não está.
- Direitos usam linguagem segura (PRODUCT_LANGUAGE §3); nunca afirma legalidade.

## 6. Campanhas (lista)

- **Aparece:** campanhas com `campaign:read`; ordem no ar→agendada→rascunho→encerrada.
- **Ação primária** "Nova campanha" só com `campaign:create`.
- **Some:** encerradas saem do topo, ficam no filtro "Encerrada".
- **Vazio:** convite a criar a primeira campanha.

## 7. Nova campanha (assistente 7 etapas)

- **Habilita** avançar só quando o passo atual é válido (ex.: período coerente,
  ao menos uma loja, ao menos um conteúdo Pronto).
- **Bloqueia** escolher conteúdo não-Pronto; escolher período no passado sem confirmação.
- **Aparece** escopo real na etapa Lojas ("412 lojas do Sudeste") e na Revisão.
- **Rascunho** salva automaticamente a cada etapa (sem diálogo: "Rascunho salvo").
- **Confirma** na Publicação (grande alcance): mostra alcance + prévia.
- **Desfaz:** "Desfazer publicação" por janela curta após publicar.
- Sair no meio mantém o rascunho; nada se perde.

## 8. Campanha :id (detalhe / prova)

- **Aparece:** resumo, onde está tocando, prova de veiculação, desempenho.
- **Habilita** "Editar/Pausar/Encerrar" conforme permissão e estado (não encerra o já encerrado).
- **Confirma** "Encerrar"/"Pausar" com alcance ("para de tocar em N lojas").
- **Desfaz:** pausar tem undo curto; encerrar confirma (é grande alcance).

## 9. Programação

- **Aparece:** grade por dia/hora × loja/grupo; regras e campanhas resolvidas.
- **Garante** que nenhuma loja fique muda: lacuna cai em **som base** (nunca silêncio).
- **Alerta** lacuna futura ("14 lojas sem programação sexta 14h") com ação de preencher.
- **Bloqueia** salvar regra que criaria conflito sem resolução; oferece escolher qual vale.
- **Confirma** mudança que afeta o que toca **agora** em muitas lojas.
- **Desfaz:** editar/mover regra tem undo.

## 10. Lojas (lista)

- **Aparece:** lojas com `tenancy:unit:read`; ordem problema→no ar.
- **Filtro padrão** prioriza offline/alerta (não alfabético).
- **Some:** nada some por filtro sem indicar "sem resultado".
- **Habilita** ações de dispositivo só com permissão de escopo correspondente.

## 11. Loja :id (loja viva)

- **Aparece:** tocando agora, próximas, status, volume, última sincronização,
  conectividade, campanhas ativas, alertas.
- **Offline:** informa há quanto tempo e que segue tocando o conteúdo já baixado
  (não alarma sem contexto).
- **Confirma** ações que mudam o que toca agora naquela loja; **desfaz** ajustes leves.

## 12. Equipe

- **Aparece:** pessoas com `identity:member:read`; ordem por papel (mais privilegiado primeiro).
- **Ação primária** "Convidar pessoa" só com `identity:member:invite`.
- **Habilita** definir papel/escopo dentro do que o próprio usuário pode delegar
  (não concede além do próprio alcance).
- **Confirma** "Remover pessoa" (perde acesso na hora) e rebaixar o próprio acesso.
- **Some:** convite expirado vira "reenviar convite".

## 13. Configurações

- **Aparece:** seções conforme permissão (perfil da empresa, marcas, idiomas, preferências).
- **Habilita** salvar só com mudança; salva com undo ("Preferências salvas").
- **Confirma** mudanças estruturais (ex.: renomear marca usada em campanhas ativas).

## 14. Regras de permissão → UI (resumo)

- Ler ausente → destino/seção **oculto**.
- Agir ausente → ação **oculta** (não desabilitada sem motivo).
- Escopo (empresa→país→marca→grupo→loja) filtra **quais** itens aparecem e onde a
  ação vale — deny-by-default. A UI nunca oferece o que o backend negaria.
