# Product Philosophy — A Constituição da Senvori

> Documento fundador. Precede o código. Em conflito entre código e este documento,
> **este documento é a verdade**. Vale por muitos anos.

A Senvori não é um software de rádio, um painel de TI ou um AutoDJ. É **a central
operacional da experiência da marca em todas as lojas de uma rede** — o lugar de
onde um Diretor de Marketing decide como a marca soa, comunica e se sente em
centenas ou milhares de pontos, ao mesmo tempo, sem ligar para cada loja.

Toda decisão de produto passa por uma pergunta única:

> **"Isso facilita a vida de um Diretor de Marketing de uma rede com centenas ou
> milhares de lojas?"** Se não, redesenhe.

---

## 1. Os conceitos-guia

### O que é simplicidade

Simplicidade não é ter poucos recursos — é **o usuário nunca precisar pensar na
máquina**. Cada tela responde, em até 5 segundos, a quatro perguntas: _onde
estou_, _o que aconteceu_, _o que precisa de mim_, _o que posso fazer agora_.
Complexidade existe; ela fica escondida atrás de padrões inteligentes (o motor de
programação gera; o usuário só define a intenção). Progressive disclosure é lei:
peça o essencial primeiro, revele o avançado depois.

### O que é elegância

Elegância é **precisão sem ruído**. Espaço em branco generoso, uma ação primária
por tela, tipografia com hierarquia clara, movimento que comunica e nunca
decora. Nada de excesso de bordas, cores ou tabelas. A referência é Apple,
Stripe, Linear, Notion, Sonos: o produto parece calmo mesmo operando algo grande.

### O que é confiança

Confiança é **prova + previsibilidade**. O usuário confia porque vê o que
aconteceu (lojas no ar, campanhas veiculadas, sincronização por loja), porque a
plataforma nunca o surpreende (undo em ações destrutivas, prévia antes de
publicar) e porque nunca o deixa mudo (loja sem campanha cai no som base, nunca
no silêncio). Erros são tratados com honestidade e uma próxima ação, nunca com
códigos técnicos.

---

## 2. Como a Senvori se comporta

### Como a IA conversa

A IA é uma **analista de marketing sênior**, nunca um chatbot. Ela fala primeiro,
com contexto e uma ação concreta:

- ✅ "14 lojas do Nordeste ficam sem programação na sexta (feriado regional).
  Quer que eu estenda a campanha 'Inverno Aurora' para cobrir o dia?"
- ❌ "Como posso ajudar você hoje?"

Regras: sempre contexto → sempre uma sugestão acionável → nunca resposta
genérica → nunca jargão. A IA propõe; o humano decide. Ela nunca executa ação
irreversível sem confirmação explícita.

### Como mostramos métricas

Números têm **significado antes de precisão**. Toda métrica vem com: um rótulo
humano, uma comparação (vs. ontem / vs. média) e, quando útil, uma micro-tendência
(sparkline). "184k ouvintes hoje ▲ 8%" comunica; "184.213" sozinho não. Métricas
que pedem ação viram alerta, não número perdido.

### Como mostramos problemas

Problemas aparecem **por severidade e com caminho de saída**. Uma faixa de cor
(crítico/atenção/informação) codifica gravidade antes da leitura; o texto diz o
que houve em linguagem de negócio e oferece o botão que resolve. Nunca mostramos
`500`, `Exception`, `Timeout`, `JWT`. Mostramos "Algo saiu do ar por aqui — já
estamos vendo. Tente de novo em instantes."

### Quando usamos confirmação — e quando NÃO

- **Confirmamos** apenas o que é **destrutivo, irreversível ou de grande alcance**:
  publicar/encerrar campanha em muitas lojas, arquivar conteúdo em uso, remover
  pessoa da equipe, mudança que afeta o que toca agora em centenas de lojas.
- **NÃO confirmamos** ações reversíveis: nelas usamos **undo** (ação imediata +
  "Desfazer" por alguns segundos). Salvar rascunho, favoritar, filtrar, editar
  metadado — acontece na hora, sem diálogo. Confirmação em excesso mata a
  velocidade e treina o usuário a clicar "OK" sem ler.

---

## 3. Como apresentamos cada coisa

### Campanhas

Criar campanha **parece montar uma apresentação**, não preencher um formulário.
Sempre em etapas curtas (Objetivo → Público → Período → Lojas → Conteúdo →
Revisão → Publicação), com prévia de onde e quando vai tocar antes de publicar, e
prova de veiculação depois. Uma campanha é uma decisão de negócio, não um registro.

### Lojas

Cada loja **parece viva**: mostra o que está tocando agora, status, última
sincronização, campanhas ativas, volume, dispositivo, conectividade e alertas.
Nunca uma linha numa tabela cinza. A pergunta que a tela responde é "esta loja
está no ar e tocando a coisa certa?".

### Música e conteúdo

Conteúdo é **patrimônio visual da marca**, não arquivo. Cada item tem capa,
artista/origem, categoria, duração, campanha vinculada, status, direitos
declarados, uso e popularidade — tudo visual, nada técnico. "Enviar" e "preparar"
substituem "upload" e "processing".

### IA

A IA aparece **onde a decisão acontece**, não numa aba isolada. Um cartão de
insight no topo do Início; uma sugestão dentro do fluxo de campanha; um aviso
antes de um conflito de programação. Ela é uma camada transversal de inteligência,
sempre opcional, sempre explicável.

---

## 4. As sensações que o produto transmite

### Como reduzimos ansiedade

Mostrando o todo antes do detalhe (o Início responde "está tudo bem?" na hora);
avisando antes do problema virar problema (IA proativa); nunca deixando o usuário
sem saber o que aconteceu (feedback imediato, estados de carregamento com
skeleton, progresso visual em uploads); e sempre oferecendo uma saída (undo,
retry, próxima ação).

### Como transmitimos controle

Prioridade sobre alfabeto: o que precisa de atenção vem primeiro. Prévia antes de
publicar. Escopo visível (esta ação afeta 412 lojas do Sudeste). Prova de
execução. O usuário sempre sabe o alcance do que faz e pode reverter.

### Como transmitimos velocidade

Ação primeiro, confirmação depois (undo em vez de diálogo). Respostas otimistas na
interface. Busca global (⌘K) que atravessa tudo. Fluxos com o mínimo de cliques
(entender a operação = 0 clique; resolver um alerta = 1 clique).

### Como transmitimos inteligência

Antecipação (a plataforma percebe o feriado antes de você). Contexto (todo número
compara; todo alerta explica). Recomendação com justificativa ("essa campanha teve
desempenho acima da média — repetir?"). A inteligência é sentida como cuidado,
não como automação fria.

---

## 5. Princípios operacionais (não negociáveis)

1. **Decisão, não CRUD.** Toda tela ajuda a decidir.
2. **Língua de marketing.** Zero termo técnico na superfície (ver PRODUCT_LANGUAGE).
3. **Prioridade > alfabeto.** Informação ordenada por urgência.
4. **Regra dos 5 segundos.** Onde estou · o que houve · o que pede atenção · o que faço.
5. **Undo por padrão; confirmação por exceção.**
6. **Nunca deixe o usuário no escuro.** Todo estado tem forma e feedback.
7. **A marca nunca fica muda.** Fallback para som base, sempre.
8. **Acessível para todos.** WCAG AA é piso, não meta.
9. **Consistência acima de novidade.** Um sistema, não telas soltas.
10. **A documentação decide; o código executa.**
