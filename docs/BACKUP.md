# Backup & Disaster Recovery (§11)

> Estratégia documentada para banco, storage, configuração e restauração. Metas
> declaradas (a validar quando o ambiente gerenciado existir): **RPO ≤ 15 min**,
> **RTO ≤ 1 h**.

## O que precisa de backup

| Ativo                 | Onde vive                      | Criticidade | Estratégia                             |
| --------------------- | ------------------------------ | ----------- | -------------------------------------- |
| Banco (Postgres)      | PG gerenciado                  | crítica     | PITR (WAL) + dump lógico diário        |
| Storage de mídia      | Cloudflare R2 (prod)           | crítica     | Versionamento de bucket + replicação   |
| Configuração/segredos | Vault do provedor              | crítica     | Backup do vault + IaC versionado (git) |
| Migrations            | `apps/api/drizzle/*.sql` (git) | crítica     | Já versionadas em git                  |

## Banco de dados

- **Contínuo (PITR):** WAL archiving no Postgres gerenciado → restauração a qualquer
  ponto no tempo (RPO ≈ minutos). É a defesa primária.
- **Lógico (diário):** `pg_dump -Fc` retido 30 dias (defesa contra corrupção lógica /
  deleção acidental que o PITR propagaria). Guardar cifrado em storage separado da
  instância.
- **Retenção:** snapshots diários 30d, semanais 12 semanas, mensais 12 meses.
- **Cifragem:** em repouso (provedor) e em trânsito (TLS). Chaves no vault.

```bash
# dump lógico (rodar como owner; NUNCA commitar o arquivo)
pg_dump -Fc "$DATABASE_OWNER_URL" -f senvori-$(date +%F).dump
# restore para uma instância limpa
createdb senvori_restore
pg_restore -d senvori_restore --no-owner --role=senvori senvori-YYYY-MM-DD.dump
```

## Storage de mídia (R2)

- **Object versioning** habilitado no bucket → recupera objetos sobrescritos/deletados.
- **Replicação** para um bucket/região secundária (ou provedor secundário) para DR.
- Os metadados dos assets vivem no Postgres (fonte de verdade); a mídia binária no R2.
  Restaurar = restaurar o Postgres **e** garantir que os objetos referenciados existem
  no R2 (as chaves de objeto são determinísticas — ver `storage/object-key.ts`).

## Configuração e segredos

- Segredos: backup do vault do provedor (exportação cifrada), rotação documentada.
- Infra: tudo como código versionado em git (compose, Dockerfiles, CI). Restaurar infra
  = reaplicar o repositório.

## Runbook de restauração (DR)

1. **Provisionar** Postgres + Redis limpos (IaC).
2. **Restaurar banco**: PITR até o último ponto sadio (ou `pg_restore` do dump mais
   recente). Recriar o app role NOBYPASSRLS (migration 0004 / `infra/db/roles.sql`).
3. **Verificar storage**: confirmar acesso ao bucket R2 (ou restaurar do secundário).
4. **Aplicar migrations** se a restauração ficou atrás: `drizzle-kit migrate`.
5. **Subir API** apontando para as novas URLs; `GET /v1/health/ready` deve dar 200.
6. **Subir Dashboard**; smoke test de login + Biblioteca.
7. **Repontar DNS/LB** para o ambiente restaurado.

## Testes de recuperação

- **Trimestral:** restaurar o último dump numa instância descartável e rodar a suíte de
  integração contra ela (prova de que o backup é restaurável, não só que existe).
- Registrar RPO/RTO reais medidos em cada exercício.

## Estado atual (honesto)

Nada disto está **provisionado** ainda (não há ambiente gerenciado nesta fase). Este
documento é o plano; a migration 0005 e o schema já estão versionados e restauráveis. A
validação real de PITR/replicação acontece quando o ambiente de staging/produção for
criado (pré-requisito antes de dados reais de clientes).
