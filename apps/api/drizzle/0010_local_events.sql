CREATE TABLE "local_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"kind" text NOT NULL,
	"category" text DEFAULT 'local_event' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"days_of_week" integer[] DEFAULT '{}' NOT NULL,
	"start_time_local" text DEFAULT '00:00' NOT NULL,
	"end_time_local" text DEFAULT '23:59' NOT NULL,
	"start_offset_ms" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"ducking_db" integer,
	"valid_from" date,
	"valid_until" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "local_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "local_events" ADD CONSTRAINT "local_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_events" ADD CONSTRAINT "local_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_events" ADD CONSTRAINT "local_events_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_events_tenant_target_idx" ON "local_events" USING btree ("tenant_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "local_events_tenant_active_idx" ON "local_events" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "local_events_category_idx" ON "local_events" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE POLICY "local_events_tenant_isolation" ON "local_events" AS PERMISSIVE FOR ALL TO public USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "local_events" FORCE ROW LEVEL SECURITY;