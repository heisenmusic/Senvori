ALTER TABLE "assets" ADD COLUMN "media_info" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "declared_rights" jsonb;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "checksum_sha256" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "error" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_tenant_idempotency_idx" ON "uploads" USING btree ("tenant_id","idempotency_key");