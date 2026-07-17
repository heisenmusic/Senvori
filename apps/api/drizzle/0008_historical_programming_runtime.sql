CREATE TABLE "rotation_pairs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_a" uuid NOT NULL,
	"asset_b" uuid NOT NULL,
	"min_gap_minutes" integer DEFAULT 60 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rotation_pairs_distinct_assets" CHECK ("rotation_pairs"."asset_a" <> "rotation_pairs"."asset_b")
);
--> statement-breakpoint
ALTER TABLE "rotation_pairs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rotation_policies" ADD COLUMN "history_lookback_days" integer;--> statement-breakpoint
ALTER TABLE "rotation_policies" ADD COLUMN "cross_day_continuity" boolean;--> statement-breakpoint
ALTER TABLE "rotation_pairs" ADD CONSTRAINT "rotation_pairs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_pairs" ADD CONSTRAINT "rotation_pairs_asset_a_assets_id_fk" FOREIGN KEY ("asset_a") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_pairs" ADD CONSTRAINT "rotation_pairs_asset_b_assets_id_fk" FOREIGN KEY ("asset_b") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_pairs" ADD CONSTRAINT "rotation_pairs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotation_pairs" ADD CONSTRAINT "rotation_pairs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rotation_pairs_tenant_pair_idx" ON "rotation_pairs" USING btree ("tenant_id","asset_a","asset_b");--> statement-breakpoint
CREATE INDEX "rotation_pairs_tenant_idx" ON "rotation_pairs" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "rotation_pairs_tenant_isolation" ON "rotation_pairs" AS PERMISSIVE FOR ALL TO public USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
-- Sprint 07B: FORCE RLS on the new table (0003 only forced tables existing then).
ALTER TABLE "rotation_pairs" FORCE ROW LEVEL SECURITY;