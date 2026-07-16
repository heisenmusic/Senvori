# 07 · Nova campanha (assistente, 7 etapas)

## 1. Objetivo

Fazer criar uma campanha **parecer montar uma apresentação**, não preencher
formulário: etapas curtas, prévia de onde/quando toca, escopo sempre visível,
prova depois. Uma campanha é uma decisão de negócio.

## 2. Persona & pergunta

Diretor de Marketing: "Como faço minha marca comunicar isto, nestas lojas, neste período?"

## 3. Rota & navegação

- Rota `/[locale]/campanhas/nova`. Breadcrumb: `Campanhas › Nova campanha`.
- Chega-se por "Nova campanha". Sair mantém rascunho.

## 4. Dados exibidos / etapas

1. **Objetivo** — o que a campanha quer alcançar.
2. **Público** — segmento/contexto.
3. **Período** — de/até (avisa se no passado).
4. **Lojas** — onde toca; **escopo visível** ("412 lojas do Sudeste").
5. **Conteúdo** — só itens **Pronto** da Biblioteca.
6. **Revisão** — prévia de onde/quando + resumo.
7. **Publicação** — publicar com confirmação de alcance.

- Fonte: Campaigns + Catalog + Tenancy via SDK.

## 5. KPIs / métricas

Escopo em números ("412 lojas", "14 dias"), estimativa de alcance quando disponível.

## 6. Ações

- **Primária (por etapa):** "Continuar"; na última, "Publicar campanha".
- **Secundárias:** "Voltar", "Salvar rascunho" (automático), "Cancelar", prévia.

## 7. Permissões

`campaign:create`; escolher lojas limitado ao escopo do usuário (não publica onde
não tem alcance). Conteúdo limitado ao que pode ler.

## 8. Estados

- **Progresso:** stepper mostra etapa atual/estado de cada passo.
- **Bloqueio de avanço:** etapa inválida bloqueia "Continuar" e explica o que falta.
- **Sem conteúdo Pronto:** aponta "adicione conteúdo à Biblioteca" com atalho.
- **Período no passado:** confirma antes de seguir.
- **Rascunho salvo:** "Rascunho salvo" (sem diálogo).
- **Publicação:** confirma alcance → toast "Campanha publicada em N lojas" (undo curto).
- **Erro ao publicar:** mantém tudo; "Tentar novamente"; nada perdido.
- **Offline:** publicar bloqueado; rascunho preservado.

## 9. Responsividade

Uma etapa por tela em mobile (stepper compacto no topo); em desktop, stepper lateral

- conteúdo + prévia. Ação primária full-width em mobile.

## 10. Acessibilidade

Stepper com `aria-current` na etapa; foco vai ao início do passo ao avançar;
validação foca o primeiro erro; escopo lido em texto (não só número colorido).

## 11. Critérios de aceite

- [ ] 7 etapas na ordem congelada; rascunho automático.
- [ ] Só conteúdo Pronto selecionável.
- [ ] Escopo real visível em Lojas e Revisão.
- [ ] Publicação confirma alcance e mostra prévia; undo curto após publicar.
- [ ] Período no passado exige confirmação.
- [ ] Sair não perde rascunho; a11y AA.

## 12. Dependências

Campaigns API (próxima sprint), Catalog (pronto), Tenancy (units), `WizardStepper`,
`Dialog`, `Toast`. Telas 03/05 (conteúdo), 08 (resultado).
