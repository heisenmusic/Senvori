# Edge Cases — Congelados

> Todo caso-limite tem comportamento definido **antes** da implementação. Um caso
> não previsto aqui é um bug de produto, não uma decisão de engenharia. Textos em
> UX_COPY_GUIDE.md; regras de estado em PRODUCT_RULES.md.

## 1. Conectividade

| Caso                             | Comportamento                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usuário fica offline (dashboard) | Faixa "Você está sem conexão. Reconectando…"; leituras já carregadas seguem visíveis; escritas ficam bloqueadas com aviso, não se perdem em silêncio. |
| Reconecta                        | Faixa some; dados revalidam; se algo mudou por baixo, realce sutil de mudança.                                                                        |
| Loja (dispositivo) fica offline  | Loja mostra "sem conexão há {tempo}" e **continua tocando o conteúdo já baixado**; nunca silêncio.                                                    |
| Loja volta                       | Sincroniza; histórico registra a lacuna; alerta se ficou desatualizada além do limite.                                                                |
| Envio de arquivo cai no meio     | Item "Falhou" com "Tentar novamente"; retoma/reenviar sem duplicar; não trava os outros envios.                                                       |

## 2. Sessão e autenticação

| Caso                            | Comportamento                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| Sessão expira em uso            | Ao agir, redireciona a `/login` **preservando o destino**; após entrar, volta ao ponto exato.  |
| Trabalho não salvo ao expirar   | Rascunhos já salvos automaticamente permanecem; formulário em edição avisa antes de perder.    |
| Login em outra empresa/aba      | `activeOrganizationId` é só preferência; a tela recarrega o escopo ativo; memberships mandam.  |
| Sem permissão no destino        | Mensagem "sem acesso" + caminho de volta; nunca tela em branco.                                |
| Papel alterado durante a sessão | Próxima ação reflete o novo escopo (deny-by-default); UI oculta o que deixou de ser permitido. |

## 3. Conteúdo (Biblioteca)

| Caso                                    | Comportamento                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Arquivo inválido/corrompido             | Recusa antes de enviar com motivo; se falhar na preparação, "Falhou" + reenviar.              |
| Conteúdo "Preparando" por muito tempo   | Mostra "Preparando…"; após limite, vira "Falhou" com reenviar; nunca fica preso invisível.    |
| Duplicidade (mesmo arquivo)             | Detecta e pergunta: "Este conteúdo já existe. Adicionar mesmo assim?" (não bloqueia à força). |
| Conteúdo em uso arquivado               | Confirma com alcance ("sai de N campanhas"); campanhas afetadas caem no som base/substituto.  |
| Direitos não declarados                 | Marca "Direitos não verificados"; permite uso mas sinaliza; nunca afirma legalidade.          |
| Substituir arquivo de conteúdo já no ar | Confirma (afeta o que toca agora); nova versão passa por preparação antes de valer.           |

## 4. Campanhas

| Caso                                            | Comportamento                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Campanha sem conteúdo Pronto                    | Bloqueia publicar; explica que precisa de ao menos um conteúdo Pronto.                 |
| Período no passado                              | Avisa ("o período começa no passado"); exige confirmação.                              |
| Campanha vencida (período terminou)             | Vira "Encerrada" automaticamente; para de tocar; lojas caem no som base/próxima regra. |
| Sobreposição de campanhas na mesma loja/horário | Resolve por prioridade definida; mostra qual vence; alerta se ambígua.                 |
| Publicar em loja offline                        | Publica; a loja recebe ao reconectar; status mostra "pendente de sincronização".       |
| Editar campanha no ar                           | Permite; mudanças de grande alcance confirmam; prévia antes de aplicar.                |
| Desfazer publicação                             | Janela curta de undo; após ela, encerrar é o caminho (com confirmação).                |

## 5. Programação

| Caso                               | Comportamento                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Programação vazia (lacuna)         | Nenhuma loja fica muda: entra **som base**; alerta proativo para preencher.             |
| Conflito de regras                 | Não salva conflito silencioso; pede para escolher qual regra vale naquele horário/loja. |
| Regra que deixaria loja muda       | Bloqueada; fallback obrigatório para som base.                                          |
| Fuso/feriado regional              | IA antecipa ("feriado no Nordeste"): sugere cobrir a lacuna antes que vire problema.    |
| Mudança que afeta o que toca agora | Confirma com alcance; aplica com prévia.                                                |

## 6. Lojas / dispositivos

| Caso                                | Comportamento                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Loja nunca sincronizou              | Estado "aguardando primeira sincronização" com orientação, não erro cru.            |
| Dispositivo trocado                 | Vincula novo dispositivo; histórico preserva a loja; sem perder identidade da loja. |
| Volume/silêncio local               | Reflete o estado real; alerta se uma loja está em mudo por muito tempo.             |
| Muitas lojas offline ao mesmo tempo | Agrupa no Início como um alerta ("6 lojas offline há +1h"), não 6 ruídos separados. |

## 7. Dados e concorrência

| Caso                                   | Comportamento                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Edição concorrente (dois editores)     | "Alguém atualizou isto enquanto você editava"; mostra a versão nova antes de sobrescrever. |
| Ação enviada duas vezes (duplo clique) | Idempotência: botão entra em loading e fica inerte; backend deduplica.                     |
| Lista muda enquanto o usuário lê       | Novos itens sinalizam ("3 novos") sem pular o scroll; usuário decide atualizar.            |
| Paginação com item removido            | Reconciliação suave; sem "buraco" nem erro; conta atualiza.                                |
| Resultado de busca vazio               | "Nada encontrado para '{termo}'" + limpar filtros; nunca tela branca.                      |

## 8. Permissões e escopo

| Caso                                    | Comportamento                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Delegar além do próprio escopo          | Bloqueado; só concede dentro do que o usuário possui.                              |
| Rebaixar/remover a si mesmo             | Confirma explicitamente (perde acesso); protege o último administrador da empresa. |
| Ver item fora do escopo por link direto | "Sem acesso"; deny-by-default; nunca vaza dado de outro tenant (RLS FORCE).        |

## 9. Entrada e limites

| Caso                             | Comportamento                                                             |
| -------------------------------- | ------------------------------------------------------------------------- |
| Texto muito longo (título/nome)  | Trunca visualmente com tooltip do valor completo; guarda o valor inteiro. |
| Caractere especial / emoji / RTL | Suportado; layout usa propriedades lógicas; não quebra.                   |
| Número gigante em KPI            | Formata por locale (184k, 1,2M); mantém legibilidade.                     |
| Upload acima do limite           | Recusa antes com o limite claro; sugere formato/compressão.               |
| Muitos filtros aplicados         | Chips removíveis; "Limpar filtros" sempre disponível.                     |

## 10. Estados de sistema

| Caso                            | Comportamento                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Erro 500/exceção                | "Algo saiu do ar por aqui — já estamos vendo. Tente de novo em instantes." + "Tentar novamente". Nunca stack/código. |
| Serviço parcial (uma área fora) | Degrada por área: o resto do produto segue; a área afetada mostra estado próprio.                                    |
| Timeout                         | Trata como erro recuperável com retry; não perde o que o usuário digitou.                                            |
| Manutenção                      | Aviso planejado, com previsão, em linguagem de produto.                                                              |

## 11. Primeiros usos (onboarding implícito)

| Caso                          | Comportamento                                                            |
| ----------------------------- | ------------------------------------------------------------------------ |
| Empresa recém-criada          | Início e listas mostram vazios úteis (primeiro passo), não telas mortas. |
| Primeira campanha/loja/pessoa | Cada vazio convida à ação certa; sem tutorial obrigatório.               |
| Sem conteúdo para campanha    | Assistente aponta "adicione conteúdo à Biblioteca primeiro" com atalho.  |

## 12. Princípio-guarda dos edge cases

Para todo caso: **(1)** nunca deixar o usuário no escuro; **(2)** nunca deixar a
marca muda; **(3)** sempre oferecer a próxima ação; **(4)** nunca vazar termo
técnico; **(5)** preservar o trabalho do usuário. Um edge case que viole qualquer
um destes é defeito.
