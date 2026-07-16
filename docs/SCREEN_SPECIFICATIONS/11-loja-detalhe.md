# 11 · Loja :id (loja viva)

## 1. Objetivo

Fazer a loja **parecer viva**: o que toca agora, status, sincronização, campanhas,
volume, dispositivo, conectividade e alertas — tudo respondendo "esta loja está no
ar e tocando o certo?".

## 2. Persona & pergunta

Diretor de Marketing: "O que está acontecendo nesta loja específica, agora?"

## 3. Rota & navegação

- Rota `/[locale]/lojas/[id]`. Breadcrumb `Lojas › {loja}`.
- Abas: **Agora · Programação · Histórico · Dispositivo**.

## 4. Dados exibidos

- **Agora:** tocando agora, próximas, volume, campanhas ativas, status/conectividade.
- **Programação:** o que está agendado para esta loja.
- **Histórico:** o que tocou, lacunas, sincronizações.
- **Dispositivo:** modelo, versão, última sincronização, saúde.
- Fonte: Tenancy (unit) + Fleet + Scheduling via SDK.

## 5. KPIs / métricas

"No ar há {tempo}" · "Sincronizado há {tempo}" · "Volume {n}%".

## 6. Ações

- **Primária (contextual):** resolver alerta (reconectar/atualizar) quando houver.
- **Secundárias:** ajustar volume, forçar sincronização, ver campanha, ver histórico.

## 7. Permissões

`tenancy:unit:read` para ver; ações de dispositivo/volume com permissão de escopo
correspondente à loja.

## 8. Estados

- **Loading:** skeleton das abas.
- **No ar:** "Tocando agora: {faixa}"; próximas listadas.
- **Offline:** "Sem conexão há {tempo}. Continua tocando o conteúdo já baixado."
- **Aguardando 1ª sincronização:** orientação, não erro cru.
- **Alerta (mudo/desatualizado):** faixa com ação que resolve.
- **Sem permissão de ação:** abas em leitura; controles ocultos.
- **Erro/Offline (app):** padrão global.

## 9. Responsividade

Abas viram seletor em mobile; "Agora" priorizado no topo. Uma coluna em mobile,
duas em desktop.

## 10. Acessibilidade

Abas com papel `tab`/`tabpanel` e setas; estado (tocando/pausado) anunciado;
controles de volume/sync rotulados; confirmação de ações que mudam o que toca agora.

## 11. Critérios de aceite

- [ ] "Agora" responde tocando/status/sync em 5 segundos.
- [ ] Offline explica que segue tocando o baixado (sem alarme gratuito).
- [ ] Ações que mudam o que toca agora confirmam.
- [ ] Abas navegáveis por teclado; a11y AA.
- [ ] Aguardando primeira sincronização tratado com orientação.

## 12. Dependências

Tenancy unit (pronto), Fleet + Scheduling (próximas sprints), `Tabs`, player/estado,
`Alert`, `Dialog`. Tela 10 (origem).
