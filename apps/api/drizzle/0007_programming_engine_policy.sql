ALTER TABLE "rotation_policies" ADD COLUMN "min_category_gap_minutes" integer;--> statement-breakpoint
ALTER TABLE "rotation_policies" ADD COLUMN "fatigue_weight_penalty" double precision;--> statement-breakpoint
ALTER TABLE "rotation_policies" ADD COLUMN "affinity_strength" double precision;