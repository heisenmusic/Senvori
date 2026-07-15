-- Custom migration: convert Analytics event tables to time-partitioned tables (D3).
-- These tables are empty at this point (created in 0001, never written before the API
-- exists), so drop-and-recreate is safe. Column shape, PK, indexes and RLS policies are
-- IDENTICAL to the Drizzle definitions in src/database/schema/analytics.ts — drizzle-kit
-- snapshots do not track PARTITION BY, so future diffs stay clean. Monthly partitions are
-- provisioned by create_analytics_partitions(); the DEFAULT partition catches stragglers
-- (late offline uploads outside the provisioned window).

DROP TABLE "playback_events";--> statement-breakpoint
DROP TABLE "device_metric_events";--> statement-breakpoint
DROP TABLE "player_error_events";--> statement-breakpoint

CREATE TABLE "playback_events" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"zone_id" uuid,
	"asset_id" uuid NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"completion_pct" smallint,
	"volume" smallint,
	"clock_skew_ms" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playback_events_id_occurred_at_pk" PRIMARY KEY("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");--> statement-breakpoint
ALTER TABLE "playback_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "playback_events_tenant_time_idx" ON "playback_events" ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "playback_events_asset_time_idx" ON "playback_events" ("asset_id","occurred_at");--> statement-breakpoint
CREATE INDEX "playback_events_device_time_idx" ON "playback_events" ("device_id","occurred_at");--> statement-breakpoint
CREATE POLICY "playback_events_tenant_isolation" ON "playback_events" AS PERMISSIVE FOR ALL TO public USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE TABLE "playback_events_default" PARTITION OF "playback_events" DEFAULT;--> statement-breakpoint

CREATE TABLE "device_metric_events" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_metric_events_id_occurred_at_pk" PRIMARY KEY("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");--> statement-breakpoint
ALTER TABLE "device_metric_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "device_metric_events_device_time_idx" ON "device_metric_events" ("device_id","occurred_at");--> statement-breakpoint
CREATE POLICY "device_metric_events_tenant_isolation" ON "device_metric_events" AS PERMISSIVE FOR ALL TO public USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE TABLE "device_metric_events_default" PARTITION OF "device_metric_events" DEFAULT;--> statement-breakpoint

CREATE TABLE "player_error_events" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"app_version" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_error_events_id_occurred_at_pk" PRIMARY KEY("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");--> statement-breakpoint
ALTER TABLE "player_error_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "player_error_events_kind_idx" ON "player_error_events" ("kind","occurred_at");--> statement-breakpoint
CREATE POLICY "player_error_events_tenant_isolation" ON "player_error_events" AS PERMISSIVE FOR ALL TO public USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE TABLE "player_error_events_default" PARTITION OF "player_error_events" DEFAULT;--> statement-breakpoint

-- Provisions the next N monthly partitions for every analytics event table.
-- Invoked by an ops job (monthly) and once here for the current month.
CREATE OR REPLACE FUNCTION create_analytics_partitions(months_ahead integer DEFAULT 3)
RETURNS void AS $$
DECLARE
	tbl text;
	m integer;
	part_start date;
	part_end date;
	part_name text;
BEGIN
	FOREACH tbl IN ARRAY ARRAY['playback_events', 'device_metric_events', 'player_error_events'] LOOP
		FOR m IN 0..months_ahead LOOP
			part_start := (date_trunc('month', now()) + (m || ' months')::interval)::date;
			part_end := (part_start + interval '1 month')::date;
			part_name := tbl || '_' || to_char(part_start, 'YYYY_MM');
			IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
				EXECUTE format(
					'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
					part_name, tbl, part_start, part_end
				);
			END IF;
		END LOOP;
	END LOOP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

SELECT create_analytics_partitions(3);
