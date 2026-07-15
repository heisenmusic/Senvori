# Senvori — Database ERD

Textual entity-relationship reference for the complete platform schema. Derived directly from
`apps/api/src/database/schema/*.ts` (Drizzle) and the migrations in `apps/api/drizzle/`. Every
table obeys the transversal conventions of `SENVORI_CORE_DOMAINS.md` §0.1.

## Conventions (apply to every table unless noted)

| Concern       | Rule                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Primary key   | `id uuid` (UUIDv7, app-generated) — except association tables (composite PK) and `countries` (`code`). |
| Timestamps    | `timestamptz`, always UTC. `created_at` / `updated_at` on business tables (`updated_at` auto-touch).   |
| Soft delete   | `archived_at timestamptz NULL` on lifecycle entities. Hard delete only via retention/compliance jobs.  |
| Multi-tenancy | `tenant_id uuid` + RLS. **FORCE**d (migration `0003`) so even the table owner is subject to policy.    |
| Money (D9)    | `bigint` minor units + `varchar(3)` ISO 4217. No floats, no implicit currency.                         |
| Time (D4)     | Persist UTC; scheduling rules stored as RRULE + local wall-clock strings.                              |

**RLS modes**

- **isolated** — `tenant_id NOT NULL`; policy `tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid` for `ALL`.
- **shared-read** — `tenant_id NULL`able; platform rows (`NULL`) readable by every tenant (`SELECT`), writes tenant-scoped. Platform rows written only by the BYPASSRLS ops role.
- **auth / platform** — no RLS: auth runs before tenant context exists (`users` is global); platform reference tables (`countries`, `plans`, `player_releases`, marketplace provider side) are global.

Migrations: `0000` fundamental core → `0001` full schema (111 tables, 90 RLS, 117 policies, 124 indexes, 198 FKs) → `0002` converts the 3 analytics event tables to monthly `PARTITION BY RANGE (occurred_at)` + `create_analytics_partitions()` → `0003` FORCE RLS on all 95 RLS tables.

---

## 0. Platform (cross-cutting)

```mermaid
erDiagram
    outbox_events {
        uuid id PK "event_id (UUIDv7)"
        text event_type
        int schema_version
        uuid tenant_id "NULL = platform event"
        timestamptz occurred_at
        jsonb actor
        jsonb payload
        timestamptz published_at "NULL until dispatched"
        int attempts
    }
    entity_translations {
        uuid id PK
        uuid tenant_id "NULL = platform content"
        text entity_type
        uuid entity_id
        text locale
        text field
        text value
    }
```

- **outbox_events** — §0.2 outbox. Idempotency key = `id`. Partial index on `created_at WHERE published_at IS NULL` (dispatcher scan) + indexes on `event_type`, `tenant_id`. No RLS (infra table; dispatcher runs as service role).
- **entity_translations** — D8 DB-content translation. Unique `(entity_type, entity_id, locale, field)`. RLS shared-read.

---

## 1. Identity (§1)

```mermaid
erDiagram
    users ||--o{ sessions : has
    users ||--o{ accounts : has
    users ||--o{ two_factors : has
    users ||--o{ memberships : "N tenants"
    tenants ||--o{ memberships : has
    tenants ||--o{ invitations : has
    memberships ||--o{ role_assignments : "role x scope"
    tenants ||--o{ api_keys : has
    tenants ||--o{ sso_connections : has
    tenants ||--o{ audit_log_entries : has
    users {
        uuid id PK
        text email UK
        bool email_verified
        text locale
        text status "active|suspended"
    }
    memberships {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        text role
        text status "invited|active|suspended"
    }
    role_assignments {
        uuid id PK
        uuid tenant_id FK
        uuid membership_id FK
        text role
        text scope_type "tenant|country|brand|group|unit"
        text scope_id
    }
    audit_log_entries {
        uuid id PK
        uuid tenant_id FK
        text actor_type
        uuid actor_id
        text action
        text resource_type
        text resource_id
        inet ip_address
        timestamptz occurred_at
    }
```

| Table               | Keys / FKs                                                               | Notable                                   | RLS         |
| ------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | ----------- |
| `users`             | PK id; UK email                                                          | global person; locale; status             | auth (none) |
| `sessions`          | FK user_id; UK token                                                     | `active_organization_id` = focused tenant | auth        |
| `accounts`          | FK user_id                                                               | provider credential (password here)       | auth        |
| `verifications`     | idx identifier                                                           | email/reset tokens                        | auth        |
| `two_factors`       | FK user_id; UK user_id                                                   | TOTP + backup codes                       | auth        |
| `memberships`       | FK tenant_id, user_id; UK (tenant_id,user_id)                            | Better Auth "member"                      | auth        |
| `invitations`       | FK tenant_id, inviter_id                                                 | expires 7d                                | auth        |
| `role_assignments`  | FK tenant_id, membership_id; UK (membership_id,role,scope_type,scope_id) | hierarchical RBAC scope                   | isolated    |
| `api_keys`          | FK tenant_id, created_by; UK key_hash                                    | least-privilege permission list           | isolated    |
| `sso_connections`   | FK tenant_id; UK email_domain                                            | SAML/OIDC (phase 2)                       | isolated    |
| `audit_log_entries` | FK tenant_id; idx (tenant,occurred_at),(resource),(actor)                | append-only, D12                          | isolated    |

---

## 2. Tenancy (§2)

```mermaid
erDiagram
    tenants ||--o{ tenant_countries : enables
    countries ||--o{ tenant_countries : ref
    tenants ||--o{ brands : has
    tenants ||--o{ groups : has
    brands ||--o{ units : has
    countries ||--o{ units : ref
    units ||--o{ zones : has
    units ||--|| business_hours : has
    groups ||--o{ group_memberships : links
    units ||--o{ group_memberships : links
    tenants {
        uuid id PK
        text slug UK
        text default_locale
        text default_timezone
        varchar default_currency
        text status
    }
    units {
        uuid id PK
        uuid tenant_id FK
        uuid brand_id FK
        varchar country_code FK
        text timezone "IANA, required"
        text locale
        text status "active|paused|archived"
    }
    zones {
        uuid id PK
        uuid unit_id FK
        text kind "audio|screen|hybrid"
        bool is_default
    }
```

| Table               | Keys / FKs                                                                                | Notable                                        | RLS                    |
| ------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| `tenants`           | PK id; UK slug                                                                            | defaults (locale/tz/currency); Better Auth org | root (isolated via id) |
| `countries`         | PK code(2)                                                                                | ISO 3166 ref; `names` jsonb; currencies[]      | platform               |
| `tenant_countries`  | FK tenant_id, country_code; UK (tenant,country)                                           | market enablement                              | isolated               |
| `brands`            | FK tenant_id; UK (tenant,slug); idx tenant                                                | brand kit anchor                               | isolated               |
| `groups`            | FK tenant_id; idx tenant                                                                  | free-form transversal grouping                 | isolated               |
| `units`             | FK tenant_id, brand_id, country_code; UK (tenant,external_code); idx tenant/brand/country | atomic execution target; geo                   | isolated               |
| `group_memberships` | FK tenant_id, group_id, unit_id; UK (group,unit)                                          | N:N                                            | isolated               |
| `zones`             | FK tenant_id, unit_id; UK (unit,name)                                                     | execution point; default zone                  | isolated               |
| `business_hours`    | FK tenant_id, unit_id; UK unit                                                            | weekly rules + exceptions (local)              | isolated               |

---

## 3. Fleet (§3)

```mermaid
erDiagram
    zones ||--o{ devices : hosts
    devices ||--o{ device_tokens : has
    devices ||--|| heartbeat_statuses : projects
    devices ||--o{ device_commands : queue
    devices ||--o{ diagnostic_reports : has
    player_releases ||--o{ ota_rollouts : distributes
    devices {
        uuid id PK
        uuid tenant_id FK
        uuid zone_id FK
        text platform "android|windows|web"
        text status "pending|active|offline|decommissioned"
        text release_channel
    }
    pairing_codes {
        uuid id PK
        text code UK
        uuid tenant_id FK "NULL until claim"
        uuid device_id FK
        timestamptz expires_at
    }
    device_tokens {
        uuid id PK
        uuid device_id FK
        text token_hash UK
        timestamptz expires_at
        timestamptz revoked_at
    }
```

| Table                | Keys / FKs                                                                   | Notable                               | RLS                  |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------- | -------------------- |
| `devices`            | FK tenant_id, zone_id; **UK zone_id WHERE status live**; idx (tenant,status) | one live device/zone (§3.9)           | isolated             |
| `pairing_codes`      | FK tenant_id, device_id; UK code; idx expires_at                             | pre-claim, tenant_id NULL until claim | none (exchange-only) |
| `device_tokens`      | FK tenant_id, device_id; UK token_hash                                       | rotating, min scope (D11)             | isolated             |
| `heartbeat_statuses` | PK device_id; FK tenant_id                                                   | hot projection only                   | isolated             |
| `player_releases`    | UK (platform,version)                                                        | Senvori build                         | platform             |
| `ota_rollouts`       | FK release_id; idx status                                                    | gradual + auto-rollback               | platform             |
| `device_commands`    | FK tenant_id, device_id, issued_by; idx (device,status)                      | expiring; desired state via manifest  | isolated             |
| `diagnostic_reports` | FK tenant_id, device_id; idx (device,created_at)                             | on-demand                             | isolated             |

---

## 4. Catalog (§4)

```mermaid
erDiagram
    assets ||--o| tracks : "1:1 (type=track)"
    assets ||--o| announcements : "1:1 (type=announcement)"
    assets ||--o{ renditions : outputs
    assets ||--o{ transcode_jobs : pipeline
    assets ||--o{ asset_categories : tagged
    categories ||--o{ asset_categories : tagged
    assets ||--o{ asset_tags : tagged
    tags ||--o{ asset_tags : tagged
    collections ||--o{ collection_assets : holds
    assets ||--o{ collection_assets : holds
    uploads ||--o| assets : produces
    assets {
        uuid id PK
        uuid tenant_id FK "NULL = platform"
        text type
        text status "uploading..ready|failed|archived"
        text origin "tenant_upload|senvori_catalog|marketplace|ai_generated"
        text language "required"
        varchar origin_country FK "required"
        text source_hash
        uuid supersedes_id
    }
    renditions {
        uuid id PK
        uuid asset_id FK
        text profile "aac_standard|aac_low|..."
        bigint bytes
        text hash
    }
```

| Table                                                   | Keys / FKs                                                                                  | Notable                                                       | RLS                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| `assets`                                                | FK tenant_id, origin_country, created_by; idx (tenant,type,status),(source_hash),(language) | mandatory global metadata (Principle 6); immutable when ready | shared-read            |
| `tracks`                                                | PK asset_id; idx isrc, artist                                                               | ISRC, BPM, energy 1–5                                         | shared-read            |
| `announcements`                                         | PK asset_id; FK voice_profile_id                                                            | TTS voice ref (§5.9)                                          | shared-read            |
| `uploads`                                               | FK tenant_id, asset_id, created_by; idx (tenant,status)                                     | multipart presigned (R2)                                      | isolated               |
| `transcode_jobs`                                        | FK asset_id; idx (status,created_at),(asset)                                                | FFmpeg queue mirror                                           | shared-read            |
| `renditions`                                            | FK asset_id; UK (asset,profile)                                                             | hash-verified by player                                       | shared-read            |
| `categories`                                            | FK tenant_id; UK (tenant,slug)                                                              | translatable taxonomy                                         | shared-read            |
| `tags`                                                  | FK tenant_id; UK (tenant,name)                                                              | free-form                                                     | isolated               |
| `collections`                                           | FK tenant_id; idx tenant                                                                    | folders                                                       | isolated               |
| `asset_categories` / `asset_tags` / `collection_assets` | composite PK                                                                                | N:N joins                                                     | shared-read / isolated |

---

## 5. Licensing (§5, D10)

```mermaid
erDiagram
    rights_holders ||--o{ licenses : holds
    licenses ||--o{ license_scopes : scoped
    license_scopes ||--o{ license_restrictions : vetoes
    licenses ||--o{ license_asset_links : covers
    licenses ||--o{ reporting_obligations : owes
    collecting_societies ||--o{ reporting_obligations : owed
    licenses ||--o{ availability_index : projects
    licenses {
        uuid id PK
        uuid tenant_id FK "NULL = platform"
        uuid rights_holder_id FK
        text origin
        text status "draft|active|expiring|expired|revoked"
        int grace_period_days
    }
    license_scopes {
        uuid id PK
        uuid license_id FK
        bool worldwide
        text[] territories "explicit ISO list"
        timestamptz starts_at
        timestamptz ends_at "NULL = perpetual"
        text[] usage_types
    }
    availability_index {
        uuid id PK
        uuid asset_id
        varchar country_code FK
        text usage_type
        uuid license_id FK
        timestamptz valid_from
        timestamptz valid_until
    }
```

| Table                   | Keys / FKs                                                                               | Notable                                        | RLS         |
| ----------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------- |
| `rights_holders`        | FK tenant_id, country_code; idx tenant                                                   | label/publisher/tenant/senvori/provider        | shared-read |
| `licenses`              | FK tenant_id, rights_holder_id; idx (tenant,status)                                      | grace period; renewal flag                     | shared-read |
| `license_scopes`        | FK license_id                                                                            | territories explicit or worldwide              | shared-read |
| `license_restrictions`  | FK scope_id                                                                              | restrictions beat scopes                       | shared-read |
| `license_asset_links`   | FK license_id; idx (target_type,target_id)                                               | asset/pack/catalog granularity                 | shared-read |
| `collecting_societies`  | FK country_code; UK (country,name)                                                       | ECAD/ASCAP/SGAE…                               | platform    |
| `reporting_obligations` | FK license_id, society_id; idx next_due_at                                               | RRULE cadence                                  | shared-read |
| `availability_index`    | FK country_code, license_id; UK (asset,country,usage,license); idx (country,usage,asset) | materialized read cache; licenses remain truth | shared-read |

---

## 6. Playlists (§6)

```mermaid
erDiagram
    playlists ||--o{ playlist_items : "manual items"
    playlists ||--o| smart_rules : "1:1 smart"
    playlists ||--o{ playlist_versions : snapshots
    packs ||--o{ pack_items : holds
    playlists ||--o{ pack_items : "in packs"
    assets ||--o{ playlist_items : ref
    playlists {
        uuid id PK
        uuid tenant_id FK "NULL = platform"
        text type "manual|smart|generated"
        text status "draft|published|archived"
        uuid generation_job_id FK
    }
    smart_rules {
        uuid playlist_id PK,FK
        jsonb criteria
        int target_duration_ms
        text ordering
    }
    playlist_versions {
        uuid id PK
        uuid playlist_id FK
        int version
        jsonb resolved_items "assets + shuffle seed"
        jsonb context
    }
```

| Table               | Keys / FKs                                                                     | Notable                       | RLS         |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------- | ----------- |
| `playlists`         | FK tenant_id, owner_id, image_asset_id, generation_job_id; idx (tenant,status) | manual/smart/generated        | shared-read |
| `playlist_items`    | FK playlist_id, asset_id; UK (playlist,position)                               | ordered                       | shared-read |
| `smart_rules`       | PK playlist_id                                                                 | dynamic criteria              | shared-read |
| `rotation_policies` | FK tenant_id; UK tenant                                                        | anti-repetition gaps          | isolated    |
| `packs`             | FK tenant_id, image_asset_id; idx (tenant,status)                              | marketplace unit              | shared-read |
| `pack_items`        | FK pack_id, playlist_id; UK (pack,playlist)                                    | ordered N:N                   | shared-read |
| `playlist_versions` | FK playlist_id; UK (playlist,version)                                          | immutable resolution snapshot | shared-read |

---

## 7. Scheduling (§7)

```mermaid
erDiagram
    schedules ||--o{ schedule_entries : slots
    devices ||--o{ manifests : "compiled per device"
    schedules {
        uuid id PK
        uuid tenant_id FK
        text target_type "tenant..zone"
        text target_id
        text status
    }
    schedule_entries {
        uuid id PK
        uuid schedule_id FK
        text content_type "playlist|pack|campaign_ref|silence"
        uuid content_id
        text rrule "RFC 5545 local"
        text start_time_local
        text layer "base_music..emergency"
        int priority
    }
    manifests {
        uuid id PK
        uuid device_id FK
        bigint version "monotonic"
        timestamptz window_start
        timestamptz window_end
        jsonb timeline
        jsonb assets "hash + signed url"
        text signature "Ed25519"
    }
```

| Table              | Keys / FKs                                               | Notable                           | RLS                                  |
| ------------------ | -------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| `schedules`        | FK tenant_id; idx (tenant,target),(tenant,status)        | bound to hierarchy node           | isolated                             |
| `schedule_entries` | FK schedule_id; idx (schedule),(content)                 | RRULE + layer + priority          | isolated                             |
| `silence_policies` | FK tenant_id; idx (tenant,target)                        | legal quiet hours                 | isolated                             |
| `manifests`        | FK tenant_id, device_id; UK (device,version); idx tenant | signed, immutable, versioned (D6) | isolated                             |
| `compilation_jobs` | idx (status,created_at)                                  | incremental compile queue         | platform-ish (no tenant FK required) |

---

## 8. Campaigns (§8)

```mermaid
erDiagram
    campaigns ||--o{ campaign_versions : "locale versions"
    campaign_versions ||--o{ campaign_version_assets : uses
    campaigns ||--o{ campaign_flights : windows
    campaigns ||--|| campaign_segments : targets
    campaigns ||--|| campaign_rotation_rules : frequency
    campaigns ||--o{ campaign_approvals : workflow
    campaigns ||--o{ campaign_distribution_resolutions : "unit->version"
    insertion_orders ||--o{ campaigns : "sponsored"
    campaigns {
        uuid id PK
        uuid tenant_id FK
        text type "audio_spot|signage|mixed"
        text status "draft..completed|archived"
        bool sponsored
        uuid insertion_order_id FK
    }
    campaign_versions {
        uuid id PK
        uuid campaign_id FK
        text locale
        text[] country_codes
        int revision
        text status
    }
    campaign_distribution_resolutions {
        uuid id PK
        uuid campaign_id FK
        uuid unit_id FK
        uuid version_id FK
        text excluded_reason
    }
```

| Table                               | Keys / FKs                                                           | Notable                                      | RLS      |
| ----------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- | -------- |
| `campaigns`                         | FK tenant_id, owner_id, insertion_order_id; idx (tenant,status),(io) | sponsored → Retail Media                     | isolated |
| `campaign_versions`                 | FK campaign_id; UK (campaign,locale,revision)                        | per-locale, immutable when approved          | isolated |
| `campaign_version_assets`           | FK version_id, asset_id; UK (version,asset,role)                     | audio/signage/thumb                          | isolated |
| `campaign_flights`                  | FK campaign_id                                                       | dates in unit-local time                     | isolated |
| `campaign_segments`                 | PK campaign_id                                                       | include/exclude hierarchy; auto-include flag | isolated |
| `campaign_rotation_rules`           | PK campaign_id                                                       | plays/hour, min gap                          | isolated |
| `campaign_approvals`                | FK campaign_id, actor_id                                             | append-only trail                            | isolated |
| `campaign_distribution_resolutions` | FK campaign_id, unit_id, version_id; UK (campaign,unit)              | locale selection / exclusion                 | isolated |

---

## 9. Brand Experience (§9)

```mermaid
erDiagram
    brands ||--|| brand_kits : has
    brand_kits ||--o{ themes : applies
    themes ||--o{ experience_profiles : assigned
    visualizer_presets ||--o{ experience_profiles : assigned
    signage_templates ||--o{ experience_profiles : assigned
    brand_kits {
        uuid id PK
        uuid tenant_id FK
        uuid brand_id FK
        jsonb palette
        text tone_of_voice "-> AI"
    }
    themes {
        uuid id PK
        uuid tenant_id FK "NULL = platform default"
        uuid brand_kit_id FK
        text surface "player_screen|signage|dashboard"
        jsonb tokens
        int version
        text status
    }
```

| Table                 | Keys / FKs                                                             | Notable                                | RLS         |
| --------------------- | ---------------------------------------------------------------------- | -------------------------------------- | ----------- |
| `brand_kits`          | FK tenant_id, brand_id; UK brand                                       | logos/palette/type/tone                | isolated    |
| `themes`              | FK brand_kit_id; UK (kit,surface,version); idx tenant                  | versioned, immutable; platform default | shared-read |
| `visualizer_presets`  | FK tenant_id                                                           | capability requirements                | shared-read |
| `motion_packs`        | FK license_id                                                          | platform, licensed                     | platform    |
| `signage_templates`   | FK tenant_id                                                           | typed content zones                    | shared-read |
| `experience_profiles` | FK tenant_id, theme_id, visualizer_id, template_id; UK (tenant,target) | specificity assignment                 | isolated    |

---

## 10. Retail Media (§10)

```mermaid
erDiagram
    sponsors ||--o{ sponsor_users : access
    sponsors ||--o{ insertion_orders : buys
    insertion_orders ||--|| pacing_states : paces
    insertion_orders ||--o{ delivery_reports : certifies
    countries ||--o{ rate_cards : priced
    sponsors {
        uuid id PK
        uuid tenant_id FK
        text industry_category "competitive sep"
        text status
    }
    insertion_orders {
        uuid id PK
        uuid tenant_id FK
        uuid sponsor_id FK
        date period_start
        date period_end
        int goal_plays
        bigint total_amount
        varchar currency
        text status "draft|signed|active|fulfilled|canceled"
    }
    delivery_reports {
        uuid id PK
        uuid insertion_order_id FK
        jsonb data "proof-of-play only"
        text certification_hash
    }
```

| Table                     | Keys / FKs                                               | Notable                      | RLS      |
| ------------------------- | -------------------------------------------------------- | ---------------------------- | -------- |
| `sponsors`                | FK tenant_id; idx tenant                                 | advertiser                   | isolated |
| `sponsor_users`           | FK tenant_id, sponsor_id, user_id; UK (sponsor,user)     | restricted access            | isolated |
| `inventory_slots`         | FK tenant_id; idx tenant                                 | capacity/hour saturation cap | isolated |
| `rate_cards`              | FK tenant_id, market; UK (tenant,slot_type,market,model) | price list per market (D9)   | isolated |
| `insertion_orders`        | FK tenant_id, sponsor_id; idx (tenant,status),(sponsor)  | the contract; money          | isolated |
| `pacing_states`           | PK insertion_order_id                                    | delivery projection          | isolated |
| `delivery_reports`        | FK insertion_order_id; idx io                            | certified from proof-of-play | isolated |
| `competitive_separations` | FK tenant_id; idx tenant                                 | anti-conflict                | isolated |

---

## 11. Marketplace (§11)

```mermaid
erDiagram
    providers ||--o{ provider_members : staff
    providers ||--o{ listings : publishes
    listings ||--o{ listing_versions : versions
    listings ||--o{ listing_prices : priced
    listings ||--o{ purchases : sold
    purchases ||--|| acquisitions : grants
    acquisitions ||--|| licenses : "creates (§5)"
    providers ||--o{ revenue_share_agreements : terms
    providers ||--o{ payouts : paid
    listings ||--o{ review_tasks : curated
    providers {
        uuid id PK "platform scope"
        text type "label|artist|agency|creator"
        varchar country_code FK
        text status "pending|approved|suspended"
    }
    purchases {
        uuid id PK
        uuid tenant_id FK
        uuid listing_id FK
        bigint price_amount
        varchar currency
        text model "one_time|subscription|per_play"
        text status
        uuid invoice_id "logical FK -> billing"
    }
```

| Table                      | Keys / FKs                                                                  | Notable                             | RLS      |
| -------------------------- | --------------------------------------------------------------------------- | ----------------------------------- | -------- |
| `providers`                | FK country_code; idx status                                                 | seller (not a tenant)               | platform |
| `provider_members`         | FK provider_id, user_id; UK (provider,user)                                 | role `provider`                     | platform |
| `listings`                 | FK provider_id; idx (provider),(status)                                     | territory-scoped offer              | platform |
| `listing_versions`         | FK listing_id; UK (listing,version)                                         | versioned content                   | platform |
| `listing_prices`           | FK listing_id, market; UK (listing,market,model)                            | price list (D9)                     | platform |
| `purchases`                | FK tenant_id, listing_id, listing_version_id; idx (tenant,status),(listing) | frozen price; logical FK invoice_id | isolated |
| `acquisitions`             | FK tenant_id, purchase_id, license_id; UK purchase                          | materializes a License              | isolated |
| `revenue_share_agreements` | FK provider_id; idx (provider,effective_from)                               | rev-share bps                       | platform |
| `payouts`                  | FK provider_id; UK (provider,period); idx status                            | immutable basis; `held` on dispute  | platform |
| `review_tasks`             | FK listing_id, reviewer_id; idx listing                                     | mandatory curation gate             | platform |

---

## 12. Billing (§12, D9)

```mermaid
erDiagram
    plans ||--o{ price_lists : priced
    plans ||--o{ subscriptions : sold
    tenants ||--|| subscriptions : "1 live"
    tenants ||--|| entitlements : materializes
    tenants ||--o{ invoices : billed
    invoices ||--o{ invoice_lines : lines
    invoices ||--o{ payments : settled
    invoices ||--o{ credit_notes : adjusted
    subscriptions {
        uuid id PK
        uuid tenant_id FK
        uuid plan_id FK
        bigint frozen_amount
        varchar currency
        text status "trialing..suspended|canceled"
        timestamptz grace_until "players keep playing"
    }
    entitlements {
        uuid tenant_id PK,FK
        bigint max_units
        bigint storage_gb
        bigint ai_credits_month
        jsonb features "module access"
        jsonb spending_cap
    }
    invoice_lines {
        uuid id PK
        uuid invoice_id FK
        text kind "subscription|usage|marketplace|retail_media|adjustment"
        bigint total_amount
        text ref_type
        uuid ref_id
    }
```

| Table              | Keys / FKs                                                                    | Notable                         | RLS      |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------- | -------- |
| `plans`            | UK name                                                                       | commercial product              | platform |
| `price_lists`      | FK plan_id, market; UK (plan,market)                                          | per-market price                | platform |
| `subscriptions`    | FK tenant_id, plan_id, price_list_id; **UK tenant_id WHERE status<>canceled** | one live; frozen price; grace   | isolated |
| `entitlements`     | PK tenant_id                                                                  | single limits interface (§12.9) | isolated |
| `usage_records`    | FK tenant_id; idx (tenant,metric,period)                                      | metered consumption             | isolated |
| `invoices`         | FK tenant_id; UK number; idx (tenant,status)                                  | header                          | isolated |
| `invoice_lines`    | FK tenant_id, invoice_id; idx invoice                                         | polymorphic ref_type/ref_id     | isolated |
| `payments`         | FK tenant_id, invoice_id; UK gateway_ref; idx invoice                         | idempotent webhook reconcile    | isolated |
| `payment_methods`  | FK tenant_id; idx tenant                                                      | card/pix/boleto                 | isolated |
| `gateway_accounts` | UK provider                                                                   | vault ref only                  | platform |
| `credit_notes`     | FK tenant_id, invoice_id; idx invoice                                         | refunds/adjustments             | isolated |
| `tax_profiles`     | FK tenant_id, market; UK (tenant,market)                                      | fiscal data                     | isolated |

---

## 13. Analytics (§13, D12)

```mermaid
erDiagram
    playback_events }o--|| tenants : scoped
    device_metric_events }o--|| tenants : scoped
    player_error_events }o--|| tenants : scoped
    metric_rollups }o--|| tenants : scoped
    report_templates ||--o{ reports : materializes
    report_templates ||--o{ report_schedules : recurs
    playback_events {
        uuid id "device event_id (part of PK)"
        timestamptz occurred_at "PART KEY (part of PK)"
        uuid tenant_id
        uuid device_id
        uuid asset_id
        jsonb context "playlist/campaign/layer/manifest_v"
        smallint completion_pct
        int clock_skew_ms
    }
```

**Event tables** (`playback_events`, `device_metric_events`, `player_error_events`) — composite PK `(id, occurred_at)`, `PARTITION BY RANGE (occurred_at)` monthly + DEFAULT (migration `0002`). Dimension refs are plain UUIDs (no FK) to keep the hot ingestion path cheap and let events survive dimension archival. Idempotency key = device-generated `id`. RLS isolated (FORCEd on parent + partitions).

| Table                  | Keys                                                                | Notable                  | RLS                   |
| ---------------------- | ------------------------------------------------------------------- | ------------------------ | --------------------- |
| `playback_events`      | PK (id,occurred_at); idx (tenant,time),(asset,time),(device,time)   | proof-of-play            | isolated, partitioned |
| `device_metric_events` | PK (id,occurred_at); idx (device,time)                              | heartbeat history        | isolated, partitioned |
| `player_error_events`  | PK (id,occurred_at); idx (kind,time)                                | OTA failure rates        | isolated, partitioned |
| `ingestion_batches`    | FK tenant_id; idx (device,created_at)                               | dedup bookkeeping        | isolated              |
| `metric_rollups`       | FK tenant_id; UK (tenant,metric,granularity,period,dimensions_hash) | permanent aggregations   | isolated              |
| `report_templates`     | FK tenant_id                                                        | platform + tenant        | shared-read           |
| `reports`              | FK tenant_id, template_id, created_by; idx (tenant,status)          | immutable when submitted | isolated              |
| `report_schedules`     | FK tenant_id, template_id; idx tenant                               | RRULE cadence            | isolated              |
| `saved_views`          | FK tenant_id, user_id; idx user                                     | per-user dashboards      | isolated              |
| `exports`              | FK tenant_id, user_id; idx (tenant,created_at)                      | audited exports          | isolated              |

---

## 14. AI (§14)

```mermaid
erDiagram
    licenses ||--o{ voice_profiles : "tts_voice"
    voice_profiles ||--o{ announcements : voices
    prompt_templates ||--o{ generation_jobs : uses
    generation_jobs ||--|| generation_results : produces
    generation_jobs ||--o{ ai_usage_records : meters
    generation_jobs {
        uuid id PK
        uuid tenant_id FK
        text type "tts|playlist|campaign_full|..."
        text status "queued|running|review|approved|rejected|failed"
        uuid prompt_template_id FK
        jsonb estimated_cost
        jsonb actual_cost
    }
    voice_profiles {
        uuid id PK
        uuid tenant_id FK "NULL = platform voice"
        text[] languages
        uuid license_id FK "required"
    }
```

| Table                | Keys / FKs                                                                       | Notable                               | RLS         |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------- | ----------- |
| `ai_adapters`        | UK (capability,provider)                                                         | pluggable gateway                     | platform    |
| `voice_profiles`     | FK tenant_id, license_id; idx tenant                                             | voice is licensable                   | shared-read |
| `prompt_templates`   | UK (use_case,version)                                                            | versioned                             | platform    |
| `generation_jobs`    | FK tenant_id, prompt_template_id, requested_by, reviewed_by; idx (tenant,status) | cost metered; human approval          | isolated    |
| `generation_results` | FK tenant_id, job_id; idx job                                                    | artifacts + mandatory rationale       | isolated    |
| `automation_rules`   | FK tenant_id, prompt_template_id; idx tenant                                     | phase-2 triggers                      | isolated    |
| `ai_usage_records`   | FK tenant_id, job_id; idx (tenant,created_at)                                    | → Billing usage                       | isolated    |
| `content_policies`   | FK tenant_id; UK tenant                                                          | platform inviolable + tenant-restrict | shared-read |

---

## Cross-domain relationships (logical FKs)

To keep the module import graph acyclic (D2), a few references are **logical FKs** — real
UUID columns without a DB-level `REFERENCES`, validated by the owning domain's public interface:

| From                  | Column                            | To                            | Why not a hard FK                        |
| --------------------- | --------------------------------- | ----------------------------- | ---------------------------------------- |
| `rights_holders`      | `provider_id`                     | `marketplace.providers`       | licensing ← marketplace would cycle      |
| `purchases`           | `invoice_id`                      | `billing.invoices`            | marketplace ← billing would cycle        |
| `schedule_entries`    | `content_id`                      | playlists / packs / campaigns | polymorphic target                       |
| `license_asset_links` | `target_id`                       | assets / packs / catalog      | polymorphic target                       |
| `invoice_lines`       | `ref_id`                          | purchases / insertion_orders  | polymorphic source                       |
| `availability_index`  | `asset_id`                        | `catalog.assets`              | read-model projection, survives archival |
| analytics `*_events`  | `device_id`,`asset_id`,`unit_id`… | fleet / catalog / tenancy     | hot path, survive dimension archival     |

**Hard FK dependency order** (create order): `countries` → `tenants` → `users`/identity →
`brands`/`groups`/`units`/`zones` → `licenses`/`voice_profiles` → `assets` → `playlists`/`packs`
→ `devices` → `schedules`/`manifests` → `campaigns` (← `insertion_orders`) → billing/analytics.

## Verification (this migration set, on PostgreSQL 16)

- 139 public tables; 95 with RLS enabled; **95 FORCE RLS**; 122 policies; 20 monthly event partitions provisioned.
- Cross-tenant write **rejected** by policy; per-tenant reads isolated; empty context returns nothing (NULLIF guard, no cast error).
- Shared-read: platform asset (`tenant_id NULL`) visible from any tenant; tenant assets isolated.
- Event insert routes to the correct monthly partition (`playback_events_2026_07`); audit + `archived_at` present.
- `drizzle-kit generate` reports **no schema changes** — schema and migrations are in sync.
