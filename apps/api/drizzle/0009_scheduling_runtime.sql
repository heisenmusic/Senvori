CREATE TABLE "schedule_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"program_version_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"days_of_week" integer[] DEFAULT '{}' NOT NULL,
	"start_time_local" text DEFAULT '00:00' NOT NULL,
	"end_time_local" text DEFAULT '23:59' NOT NULL,
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
ALTER TABLE "schedule_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_program_id_playlists_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_program_version_id_playlist_versions_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."playlist_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_assignments_tenant_target_idx" ON "schedule_assignments" USING btree ("tenant_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "schedule_assignments_tenant_active_idx" ON "schedule_assignments" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "schedule_assignments_program_idx" ON "schedule_assignments" USING btree ("program_id");--> statement-breakpoint
CREATE POLICY "schedule_assignments_tenant_isolation" ON "schedule_assignments" AS PERMISSIVE FOR ALL TO public USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
-- Sprint 08: FORCE RLS on the new table (0003 only forced tables existing then).
ALTER TABLE "schedule_assignments" FORCE ROW LEVEL SECURITY;