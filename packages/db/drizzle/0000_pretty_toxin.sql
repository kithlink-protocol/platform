CREATE TYPE "public"."staff_role" AS ENUM('owner', 'admin', 'coordinator', 'volunteer', 'viewer');--> statement-breakpoint
CREATE TABLE "animal_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"alt_text" text,
	"bytes" bigint,
	"mime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shelter_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"breed" text,
	"birth_year" integer,
	"sex" text DEFAULT 'unknown' NOT NULL,
	"size" text,
	"status" text DEFAULT 'available' NOT NULL,
	"description" text,
	"medical_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"traits_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fts" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(breed,'') || ' ' || coalesce(description,''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "animals_species_check" CHECK ("animals"."species" IN ('dog','cat','other')),
	CONSTRAINT "animals_sex_check" CHECK ("animals"."sex" IN ('male','female','unknown')),
	CONSTRAINT "animals_size_check" CHECK ("animals"."size" IS NULL OR "animals"."size" IN ('small','medium','large','xl')),
	CONSTRAINT "animals_status_check" CHECK ("animals"."status" IN ('draft','available','pending','adopted','unavailable'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"shelter_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"shelter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "staff_role" DEFAULT 'volunteer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_shelter_id_user_id_pk" PRIMARY KEY("shelter_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"totp_secret_enc" text,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animal_photos_animal_idx" ON "animal_photos" USING btree ("animal_id","position");--> statement-breakpoint
CREATE INDEX "animals_shelter_status_idx" ON "animals" USING btree ("shelter_id","status");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");