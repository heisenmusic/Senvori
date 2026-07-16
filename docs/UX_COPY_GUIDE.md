# UX Copy Guide — Todos os Textos Congelados

> Nenhuma tela usa Lorem Ipsum, texto improvisado ou string inventada em
> implementação. Todo texto de produto nasce aqui, em pt-BR canônico, com pares
> en-US / es-ES. Vocabulário obedece a PRODUCT_LANGUAGE.md; tom obedece a
> PRODUCT_PHILOSOPHY.md (parceiro sênior, específico, sem apologia vazia).

## 1. Princípios de escrita (resumo operável)

1. **Voz ativa, verbo de resultado.** Botão = o que acontece.
2. **Segunda pessoa, tom de parceiro.** "Sua biblioteca", não "O sistema".
3. **Específico vence esperto.** "14 lojas ficam sem som na sexta".
4. **Sem apologia vazia.** Erro = o que houve + próximo passo.
5. **Número com significado.** Rótulo + comparação.
6. **Sem jargão.** Zero termo técnico na superfície.
7. **Frase curta.** Uma ideia por frase; título ≤ ~40 caracteres.

## 2. Microcopy global (chaves de i18n)

| Chave                      | pt-BR              | en-US             | es-ES            |
| -------------------------- | ------------------ | ----------------- | ---------------- |
| `action.save`              | Salvar             | Save              | Guardar          |
| `action.cancel`            | Cancelar           | Cancel            | Cancelar         |
| `action.publish`           | Publicar           | Publish           | Publicar         |
| `action.tryAgain`          | Tentar novamente   | Try again         | Reintentar       |
| `action.undo`              | Desfazer           | Undo              | Deshacer         |
| `action.addContent`        | Adicionar conteúdo | Add content       | Añadir contenido |
| `action.newCampaign`       | Nova campanha      | New campaign      | Nueva campaña    |
| `action.invitePerson`      | Convidar pessoa    | Invite person     | Invitar persona  |
| `action.remove`            | Remover            | Remove            | Quitar           |
| `action.archive`           | Arquivar           | Archive           | Archivar         |
| `search.globalPlaceholder` | Buscar em tudo     | Search everything | Buscar en todo   |
| `state.loading`            | Carregando         | Loading           | Cargando         |
| `state.saved`              | Salvo              | Saved             | Guardado         |
| `nav.company`              | Empresa            | Company           | Empresa          |
| `nav.signOut`              | Sair               | Sign out          | Cerrar sesión    |

Nomes de destino da navegação: ver PRODUCT_LANGUAGE §5 (congelados).

## 3. Textos por tela

### 3.1 Login

- Título: **"Entrar na Senvori"** / "Sign in to Senvori" / "Entrar en Senvori"
- Subtítulo: "A central da sua marca em todas as lojas."
- Campos: "E-mail", "Senha" · Ação: "Entrar" · Link: "Esqueci minha senha"
- Erro de credencial: **"E-mail ou senha não conferem. Tente novamente."**
  (nunca revelar qual dos dois falhou)
- Erro de sistema: "Não foi possível entrar agora. Tente de novo em instantes."

### 3.2 Início (Centro de Comando)

- Título: **"Início"** · Subtítulo: "Como está sua operação agora."
- Saudação contextual opcional: "Bom dia, {nome}. Tudo no ar." / "…14 lojas pedem atenção."
- Bloco de KPI (exemplos reais, nunca placeholder):
  - "184k ouvintes hoje ▲ 8% vs. ontem"
  - "312 de 318 lojas no ar"
  - "5 campanhas no ar"
- Insight de IA (exemplo): "14 lojas do Nordeste ficam sem programação na sexta
  (feriado regional). Quer estender a campanha 'Inverno Aurora' para cobrir o dia?"
  Ações: "Estender campanha" · "Agora não"
- Vazio (empresa recém-criada): título "Vamos preparar sua operação." · texto
  "Comece adicionando conteúdo à sua biblioteca ou convidando sua equipe." ·
  ações "Adicionar conteúdo" · "Convidar pessoa".

### 3.3 Biblioteca

- Título: **"Biblioteca"** · Subtítulo: "O conteúdo da sua marca."
- Ação primária: "Adicionar conteúdo" · Busca placeholder: "Buscar por título, artista…"
- Filtros (rótulos): "Tipo", "Status", "Idioma", "Origem", "Campanha".
- Vazio inicial: título **"Sua biblioteca ainda está vazia."** · texto "Adicione
  músicas e locuções para usar nas suas campanhas." · ação "Adicionar conteúdo".
- Sem resultado de busca: título "Nada encontrado para '{termo}'." · texto "Ajuste
  a busca ou limpe os filtros." · ação "Limpar filtros".
- Card: badge de status usa rótulos oficiais (Enviando/Preparando/Pronto/Falhou/Arquivado).

### 3.4 Adicionar conteúdo (envio)

- Título do painel: "Adicionar conteúdo"
- Área de envio: **"Arraste arquivos aqui ou clique para escolher."**
  Ajuda: "Áudio até {limite}. Formatos aceitos: MP3, WAV, AAC."
- Durante envio: "Enviando {arquivo}… {porcentagem}%" · "Preparando conteúdo…"
- Sucesso: toast "Conteúdo adicionado." (undo: "Desfazer")
- Falha de envio: "{arquivo} não foi enviado. Verifique o arquivo e tente de novo."
  ação "Tentar novamente".
- Direitos (linguagem segura): rótulo "Direitos" · opções "Informação declarada
  pelo responsável", "Documentação pendente", "Direitos não verificados". Nunca
  "Licenciado"/"Livre de royalties" como afirmação da plataforma.

### 3.5 Conteúdo :id (detalhe)

- Campos: "Título", "Artista/Origem", "Categoria", "Idioma", "Duração", "Campanha
  vinculada", "Direitos", "Uso", "Popularidade".
- Ações: "Salvar" (undo) · "Arquivar" (confirma: destrutivo se em uso) · "Substituir arquivo".
- Preparando: "Estamos preparando este conteúdo. Ele fica pronto em instantes."
- Falhou: "Não conseguimos preparar este conteúdo. Tente enviar novamente."

### 3.6 Campanhas

- Título: **"Campanhas"** · Subtítulo: "O que sua marca comunica e quando."
- Ação primária: "Nova campanha"
- Filtros: "Status", "Período", "Lojas/Região"
- Status (badges): "Rascunho", "Agendada", "No ar", "Encerrada"
- Vazio: título "Nenhuma campanha ainda." · texto "Crie sua primeira campanha para
  falar com suas lojas." · ação "Nova campanha".

### 3.7 Nova campanha (assistente, 7 etapas)

Passos: **"Objetivo" → "Público" → "Período" → "Lojas" → "Conteúdo" → "Revisão" →
"Publicação"**. Cada passo:

- Objetivo: "O que esta campanha quer alcançar?" (ex.: "Aumentar fluxo no fim de semana")
- Público/Período: "De quando até quando?" · aviso se período no passado.
- Lojas: "Onde vai tocar?" com escopo visível: "Esta campanha vai para **412 lojas
  do Sudeste**." (escopo sempre explícito antes de publicar)
- Conteúdo: "O que vai tocar?" (só conteúdo Pronto pode ser adicionado).
- Revisão: prévia de onde e quando + resumo.
- Publicação: botão **"Publicar campanha"** → confirmação (grande alcance) →
  toast "Campanha publicada em 412 lojas." (undo curto: "Desfazer publicação").
- Rascunho salva sozinho: "Rascunho salvo" (sem diálogo).

### 3.8 Campanha :id (detalhe / prova)

- Seções: "Resumo", "Onde está tocando", "Prova de veiculação", "Desempenho".
- Ações: "Editar", "Pausar", "Encerrar" (confirma: grande alcance).
- Encerrar: "Encerrar 'Inverno Aurora'? Ela para de tocar em 412 lojas." ações
  "Encerrar campanha" (destrutivo) · "Cancelar".

### 3.9 Programação

- Título: **"Programação"** · Subtítulo: "O que toca em cada momento."
- Garantia: "Nenhuma loja fica muda — sem campanha, entra o som base."
- Conflito: "Duas regras disputam o mesmo horário em 8 lojas. Escolha qual vale."
- Regra vazia/lacuna: "Sexta, 14h–18h: 14 lojas sem programação. Preencher?"

### 3.10 Lojas

- Título: **"Lojas"** · Subtítulo: "Cada loja no ar e tocando o certo."
- Filtros: "Status", "Região", "Marca", "Grupo" · ordena problema primeiro.
- Status: "No ar", "Offline", "Alerta"
- Card de loja: "Tocando agora: {faixa}" · "Sincronizado há {tempo}" · "Sem conexão há {tempo}".
- Offline: "Esta loja está sem conexão há {tempo}. Ela continua tocando o conteúdo
  já baixado." (nunca alarmar sem contexto)

### 3.11 Loja :id (loja viva)

- Abas: "Agora", "Programação", "Histórico", "Dispositivo".
- "Tocando agora", "Próximas", "Volume", "Última sincronização", "Conectividade".

### 3.12 Equipe

- Título: **"Equipe"** · Subtítulo: "Quem pode fazer o quê."
- Ação: "Convidar pessoa" · Filtros: "Papel", "Status", "Escopo".
- Convite: campos "E-mail", "Papel", "Escopo (empresa/marca/grupo/loja)".
  Sucesso: "Convite enviado para {email}."
- Remover pessoa (confirma): "Remover {nome} da equipe? Ela perde o acesso na hora."
- Status: "Ativo", "Convite pendente", "Suspenso".

### 3.13 Configurações

- Seções: "Perfil da empresa", "Marcas", "Idiomas", "Preferências".
- Salvar sem diálogo (undo): "Preferências salvas."

## 4. Mensagens de erro (catálogo)

| Situação                | Texto                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| Erro genérico (500)     | "Algo saiu do ar por aqui — já estamos vendo. Tente de novo em instantes." |
| Sem conexão             | "Você está sem conexão. Reconectando…"                                     |
| Sessão expirada         | "Sua sessão expirou. Entre novamente para continuar de onde parou."        |
| Sem permissão           | "Você não tem acesso a esta área. Fale com quem administra sua empresa."   |
| Não encontrado          | "Não encontramos o que você procura. Ele pode ter sido arquivado."         |
| Conflito de edição      | "Alguém atualizou isto enquanto você editava. Veja a versão mais recente." |
| Campo obrigatório       | "Preencha este campo para continuar."                                      |
| Arquivo inválido        | "Este arquivo não é um áudio aceito. Use MP3, WAV ou AAC."                 |
| Ação com grande alcance | "Isto afeta {n} lojas. Confirmar?"                                         |

Regra: **nunca** `500`, `Exception`, `Timeout`, `JWT`, `null`, stack trace na tela.

## 5. Tom por severidade

- **Crítico:** direto, sem alarme gratuito, com a ação que resolve. ("312 de 318 no
  ar. 6 lojas offline há mais de 1h. Ver lojas.")
- **Atenção:** antecipa. ("14 lojas ficam sem som na sexta. Preencher agora?")
- **Sucesso:** breve e concreto, com undo quando cabe. ("Campanha publicada. Desfazer")
- **Informação/IA:** de analista, com contexto e sugestão. (ver §3.2)

## 6. Regras de i18n

- Toda string vive em catálogo `next-intl` (pt-BR/en-US/es-ES); nada hardcoded na tela.
- Números, datas e moeda formatados por locale (`Intl`).
- Plural e interpolação via ICU (`{n, plural, ...}`).
- pt-BR é o canônico; en-US e es-ES traduzem o **sentido**, não a letra.
- Termos de marca ("Senvori") não se traduzem.
