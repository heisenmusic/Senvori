# infra/docker

Local development infrastructure and production images.

```bash
# local services (Postgres 16 + Redis 7)
docker compose -f infra/docker/docker-compose.yml up -d

# production images (build from repo root)
docker build -f infra/docker/Dockerfile.api -t senvori/api .
docker build -f infra/docker/Dockerfile.dashboard -t senvori/dashboard .
```

Postgres runs with a single `senvori` database. Row Level Security policies are created by the
Drizzle migrations in `apps/api/drizzle` — see `apps/api/README.md` for the RLS model.
