ALTER TABLE "playlist_versions" ADD COLUMN "plan_hash" text;--> statement-breakpoint
ALTER TABLE "playlist_versions" ADD COLUMN "compiler_version" text;--> statement-breakpoint
ALTER TABLE "playlist_versions" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "playlist_versions" ADD CONSTRAINT "playlist_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;