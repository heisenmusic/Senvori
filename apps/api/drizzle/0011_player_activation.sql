ALTER TABLE "device_tokens" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "heartbeat_statuses" ADD COLUMN "runtime_state" text;--> statement-breakpoint
ALTER TABLE "heartbeat_statuses" ADD COLUMN "connectivity" text;--> statement-breakpoint
ALTER TABLE "heartbeat_statuses" ADD COLUMN "contract_version" text;--> statement-breakpoint
ALTER TABLE "heartbeat_statuses" ADD COLUMN "effective_plan_hash" text;--> statement-breakpoint
ALTER TABLE "heartbeat_statuses" ADD COLUMN "current_item_id" text;--> statement-breakpoint
ALTER TABLE "heartbeat_statuses" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "heartbeat_statuses" ADD COLUMN "storage" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "heartbeat_statuses" ADD COLUMN "last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "activation_secret_hash" text;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "claimed_by" uuid;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pairing_codes_status_idx" ON "pairing_codes" USING btree ("status");--> statement-breakpoint
CREATE POLICY "device_tokens_self_auth" ON "device_tokens" AS PERMISSIVE FOR SELECT TO public USING (token_hash = NULLIF(current_setting('app.device_token_hash', true), ''));
--> statement-breakpoint
-- Sprint 10A: allow the application role to set the device self-auth GUC. Custom
-- two-part GUCs (app.*) need no grant to be SET at transaction scope, so this is
-- belt-and-suspenders and only applies where the least-privilege role exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'senvori_app') THEN
    GRANT SET ON PARAMETER "app.device_token_hash" TO senvori_app;
  END IF;
END $$;
