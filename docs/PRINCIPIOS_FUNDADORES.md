# PRINCÍPIOS FUNDADORES DA SENVORI

Toda decisão de produto, arquitetura, UX, banco de dados, APIs e infraestrutura deve respeitar os princípios abaixo.

## 1. Global First

A Senvori não é uma empresa brasileira.
A Senvori é uma empresa global que iniciou sua operação no Brasil.

Toda funcionalidade deve ser projetada para funcionar em qualquer país.

Nenhuma funcionalidade deve assumir:

- Idioma único
- Moeda única
- Timezone único
- Legislação única
- Cultura única

A plataforma deve nascer preparada para expansão internacional.

---

## 2. Multi-Linguagem Nativa

Toda a plataforma deve suportar internacionalização desde o primeiro dia.

Idiomas iniciais:

- Português (Brasil)
- Inglês
- Espanhol

Arquitetura preparada para:

- Francês
- Alemão
- Italiano
- Japonês
- Coreano
- Chinês
- Árabe

Nenhum texto pode ficar hardcoded.
Todo texto deve utilizar sistema de tradução centralizado.

---

## 3. Multi-Tenant Global

Cada tenant poderá operar em múltiplos países.

Cada tenant poderá definir:

- Idioma padrão
- Moeda padrão
- Timezone padrão

Cada usuário poderá definir:

- Idioma próprio

Cada unidade poderá possuir:

- Idioma próprio
- País próprio
- Timezone próprio

---

## 4. Multi-Timezone

Toda programação deve utilizar o horário local da unidade.

Exemplos:

- São Paulo → 08:00 local
- Nova York → 08:00 local
- Madrid → 08:00 local

O servidor distribui regras.
A execução ocorre localmente.

---

## 5. Campanhas Globais

Uma única campanha deve suportar múltiplas versões.

Exemplo: Black Friday

- Português
- Inglês
- Espanhol

A Senvori deve distribuir automaticamente a versão correta para cada unidade.

---

## 6. Conteúdo Global

Todo conteúdo deve possuir:

- Idioma
- País
- Região
- Categoria
- Licenciamento

Aplicável para:

- Música
- Playlists
- Locuções
- Campanhas
- Vídeos
- Signage
- Conteúdo IA

---

## 7. Marketplace Global

O marketplace deve suportar:

- Múltiplos idiomas
- Múltiplas moedas
- Múltiplos países
- Licenciamento regional

Participantes:

- Gravadoras
- Selos
- Artistas
- Criadores
- Agências
- Marcas

---

## 8. IA Global

Toda IA deve ser projetada para operar em múltiplos idiomas.

Incluindo:

- Locuções
- Campanhas
- Playlists
- Branding
- Conteúdo

---

## 9. Escalabilidade Global

A arquitetura deve suportar:

- 1 loja
- 100 lojas
- 1.000 lojas
- 10.000 lojas
- 100.000 lojas

Sem necessidade de reescrita estrutural.

---

## 10. Global Brand Platform

A Senvori deve ser percebida como uma plataforma internacional.

A experiência visual deve competir com:

- Shopify
- Stripe
- Notion
- Linear
- Figma
- HubSpot
- Salesforce

Nunca com softwares tradicionais de rádio online.
