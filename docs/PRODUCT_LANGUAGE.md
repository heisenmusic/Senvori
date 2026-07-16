# Product Language — Dicionário Oficial

> Nenhuma tela, texto, rótulo, tooltip, mensagem de erro ou notificação pode usar
> linguagem diferente da definida aqui. A superfície do produto fala **marketing**,
> não engenharia. Termos técnicos vivem no código e nos docs de engenharia — nunca
> na interface.

## 1. Dicionário técnico → produto (proibido → oficial)

| Nunca dizer (técnico)           | Sempre dizer (produto pt-BR)         | en-US                | es-ES              |
| ------------------------------- | ------------------------------------ | -------------------- | ------------------ |
| Tenant / Organization           | Empresa                              | Company              | Empresa            |
| Unit                            | Loja                                 | Store                | Tienda             |
| Brand                           | Marca                                | Brand                | Marca              |
| Group                           | Grupo (de lojas)                     | Group                | Grupo              |
| Asset / Media Object            | Conteúdo                             | Content              | Contenido          |
| Track                           | Música                               | Song                 | Canción            |
| Announcement / Spot             | Locução / Anúncio                    | Voice / Ad           | Locución / Anuncio |
| Blob / Object / File binary     | Arquivo                              | File                 | Archivo            |
| Catalog                         | Biblioteca                           | Library              | Biblioteca         |
| Storage / Bucket                | Biblioteca (armazenamento invisível) | —                    | —                  |
| Upload                          | Enviar / Adicionar conteúdo          | Add content          | Añadir contenido   |
| Processing / Transcode / Worker | Preparando                           | Preparing            | Preparando         |
| Rendition                       | Versão (do conteúdo)                 | Version              | Versión            |
| Playback                        | Reprodução / Tocando                 | Playing              | Reproducción       |
| Scheduler / Manifest            | Programação                          | Scheduling           | Programación       |
| Playlist (montada à mão)        | Trilha / Regra de programação        | —                    | —                  |
| Campaign                        | Campanha                             | Campaign             | Campaña            |
| Device / Player / Fleet         | Dispositivo                          | Device               | Dispositivo        |
| Sync / Heartbeat                | Sincronização                        | Sync                 | Sincronización     |
| Identity / Member / RBAC        | Equipe / Permissões                  | Team / Permissions   | Equipo / Permisos  |
| Role                            | Papel / Nível de acesso              | Role                 | Rol                |
| Session / JWT / Token / Cookie  | Sessão                               | Session              | Sesión             |
| Pipeline                        | Processo                             | Process              | Proceso            |
| Endpoint / API                  | (nunca exposto)                      | —                    | —                  |
| License / Rights                | Direitos                             | Rights               | Derechos           |
| Availability index              | Disponibilidade                      | Availability         | Disponibilidad     |
| Audit log                       | Histórico de atividades              | Activity history     | Historial          |
| Archive (soft delete)           | Arquivar                             | Archive              | Archivar           |
| Query / Filter                  | Filtro / Busca                       | Filter / Search      | Filtro / Búsqueda  |
| Error 500 / Exception           | Algo saiu do ar                      | Something went wrong | Algo salió mal     |
| Retry                           | Tentar novamente                     | Try again            | Reintentar         |
| Loading                         | Carregando                           | Loading              | Cargando           |
| Empty state                     | (nunca dito)                         | —                    | —                  |
| Idempotency key                 | (invisível)                          | —                    | —                  |

## 2. Regras de escrita

- **Voz ativa, verbo de resultado.** O botão diz o que acontece: "Publicar
  campanha" → toast "Campanha publicada". Nunca "Submit", "OK", "Confirmar" solto.
- **Segunda pessoa, tom de parceiro sênior.** "Sua biblioteca ainda está vazia",
  não "Nenhum registro encontrado".
- **Específico vence esperto.** "14 lojas ficam sem som na sexta" vence "Atenção:
  possíveis lacunas de agendamento".
- **Sem apologia vazia.** Erros explicam o que houve e o próximo passo, sem
  "Desculpe pelo inconveniente".
- **Números com significado.** Sempre rótulo + comparação quando possível.
- **Nunca sigla técnica** (RLS, JWT, R2, MP3 aparecem só em detalhes opcionais de
  conteúdo, nunca como conceito de produto).

## 3. Direitos — linguagem segura (obrigatória)

Direitos são **declarados pelo responsável**, não verificados pela plataforma.
A linguagem nunca afirma legalidade:

- ✅ "Informação declarada pelo responsável"
- ✅ "Documentação pendente"
- ✅ "Direitos não verificados"
- ✅ "Aprovado para uso" — **somente** após um workflow de aprovação explícito
- ❌ "Licenciado" / "Autorizado" / "Livre de royalties" (como afirmação da plataforma)

## 4. Estados — vocabulário oficial de conteúdo

| Estado interno | Rótulo de produto | Cor semântica |
| -------------- | ----------------- | ------------- |
| uploading      | Enviando          | neutro/marca  |
| processing     | Preparando        | marca         |
| ready          | Pronto            | sucesso       |
| failed         | Falhou            | crítico       |
| archived       | Arquivado         | neutro        |

## 5. Nomes de destino (navegação — congelados)

`Início` · `Biblioteca` · `Campanhas` · `Programação` · `Lojas` · `Equipe` ·
`Configurações`. Ver INFORMATION_ARCHITECTURE.md.
