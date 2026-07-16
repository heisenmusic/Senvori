# 04 · Adicionar conteúdo (envio)

## 1. Objetivo

Transformar arquivos em patrimônio da marca sem que o usuário pense em "upload",
"processing" ou formatos técnicos. Enviar → preparar → pronto, com progresso visível.

## 2. Persona & pergunta

Diretor de Marketing: "Como coloco minhas músicas e locuções aqui para usar?"

## 3. Rota & navegação

- Painel/drawer sobre a Biblioteca (ou rota `/[locale]/biblioteca/adicionar`).
- Chega-se pela ação primária da Biblioteca. Fecha com `Esc`/backdrop (se nada em envio).

## 4. Dados exibidos

- Área de arrastar/soltar; lista de arquivos em envio com nome, tamanho, progresso,
  status; campos mínimos de metadado (título, tipo, direitos declarados).
- Fonte: fluxo upload→confirm→process do Catalog via SDK.

## 5. KPIs / métricas

Progresso por arquivo (%) e resumo ("3 de 4 enviados").

## 6. Ações

- **Primária:** "Adicionar" (inicia envio dos selecionados).
- **Secundárias:** escolher arquivos, remover da fila, tentar novamente (falha),
  cancelar envio em andamento.

## 7. Permissões

`catalog:asset:create`. Sem ela, a ação nem aparece na Biblioteca.

## 8. Estados

- **Ocioso:** "Arraste arquivos aqui ou clique para escolher." + formatos/limite.
- **Validação:** recusa formato inválido antes de enviar, com motivo.
- **Enviando:** ProgressBar real por arquivo; "Enviando {arquivo} {%}".
- **Preparando:** "Preparando conteúdo…" (não bloqueia adicionar mais).
- **Pronto:** item vira Pronto; toast "Conteúdo adicionado." (undo curto).
- **Falha:** item "Falhou" + "Tentar novamente"; não afeta os outros.
- **Duplicidade:** "Este conteúdo já existe. Adicionar mesmo assim?".
- **Offline:** envio pausa; retoma ao reconectar; nada se perde.

## 9. Responsividade

Painel full-screen em mobile; drawer/modal em desktop. Área de drop grande e tocável.

## 10. Acessibilidade

Drop zone tem alternativa por clique/teclado (input file rotulado). Progresso
anunciado por marcos (`aria-live`). Erros por `aria-describedby`. Foco preso no painel.

## 11. Critérios de aceite

- [ ] Arrastar-soltar **e** escolher por clique/teclado funcionam.
- [ ] Formato inválido recusado antes do envio, com motivo claro.
- [ ] Progresso real por arquivo; falha isolada com retry.
- [ ] Estados Enviando→Preparando→Pronto com rótulos oficiais.
- [ ] Duplicidade detectada e perguntada, não bloqueada à força.
- [ ] Direitos em linguagem segura; undo ao adicionar.
- [ ] a11y AA; foco preso e devolvido ao fechar.

## 12. Dependências

Catalog API (upload/confirm/process — pronto), storage assinado, `FileDrop`,
`ProgressBar`, `Toast`. Tela 03 (origem) e 05 (destino do item).
