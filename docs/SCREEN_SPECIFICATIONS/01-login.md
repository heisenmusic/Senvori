# 01 · Login

## 1. Objetivo

Levar a pessoa certa para dentro da sua empresa, com o mínimo de atrito e sem
expor nada técnico. Não é uma tela de decisão de negócio — é a porta.

## 2. Persona & pergunta

Diretor de Marketing (ou membro da equipe): "Quero entrar e ver minha operação."

## 3. Rota & navegação

- Rota pública `/[locale]/login` (fora do shell autenticado).
- Com sessão válida → redireciona ao Início.
- Sem sessão em qualquer rota → redireciona aqui **preservando o destino**.

## 4. Dados exibidos

- Marca Senvori (logo + tagline), campos E-mail e Senha, link "Esqueci minha senha",
  seletor de idioma (pt-BR/en-US/es-ES).

## 5. KPIs / métricas

Nenhum.

## 6. Ações

- **Primária:** "Entrar" (autentica via Better Auth).
- **Secundárias:** "Esqueci minha senha", trocar idioma.

## 7. Permissões

Pública. Sem sessão exigida.

## 8. Estados

- **Loading:** botão "Entrar" em loading, inerte, `aria-busy`.
- **Erro de credencial:** "E-mail ou senha não conferem. Tente novamente." (não
  revela qual campo).
- **Erro de sistema:** "Não foi possível entrar agora. Tente de novo em instantes."
- **Offline:** aviso de sem conexão; botão desabilitado com explicação.
- **Vazio/sem permissão/sessão:** não se aplicam (tela pública).

## 9. Responsividade

Cartão centralizado; full-width em mobile; ação primária full-width em `sm`.

## 10. Acessibilidade

Labels associados; erro por `aria-describedby`; foco inicial no E-mail; `<html lang>`
segue o idioma; senha com botão mostrar/ocultar rotulado.

## 11. Critérios de aceite

- [ ] Entra com credencial válida e cai no destino pretendido (ou Início).
- [ ] Mensagem de erro única, sem revelar campo, sem código técnico.
- [ ] Loading impede duplo submit.
- [ ] Teclado + foco visível + contraste AA.
- [ ] Sessão válida em `/login` redireciona ao Início.

## 12. Dependências

Better Auth (sessão/cookie), `@senvori/sdk` (auth), catálogo de textos i18n.
