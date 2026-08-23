CREATE TYPE "public"."application_status" AS ENUM('draft', 'submitted', 'in_review', 'info_requested', 'approved', 'denied', 'withdrawn', 'adopted', 'expired');--> statement-breakpoint
CREATE TABLE "applicant_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text,
	"phone" text,
	"address_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applicant_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"shelter_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"answers_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"storage_key" text NOT NULL,
	"edek_wrapped" text NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"state" text DEFAULT 'uploaded' NOT NULL,
	"extracted_json" jsonb,
	"confidence" numeric(4, 3),
	"redacted_text" text,
	"expires_at" timestamp with time zone,
	"network_verified" boolean DEFAULT false NOT NULL,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_type_check" CHECK ("artifacts"."type" IN ('lease_addendum','vet_record','gov_id','utility_bill','other')),
	CONSTRAINT "artifacts_state_check" CHECK ("artifacts"."state" IN ('uploaded','parsing','parsed','pending_review','verified','rejected','expired','failed_parse'))
);
--> statement-breakpoint
CREATE TABLE "consent_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"shelter_id" uuid NOT NULL,
	"application_id" uuid,
	"scope" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "consent_grants_scope_check" CHECK ("consent_grants"."scope" IN ('application_review','post_adoption_contact')),
	CONSTRAINT "consent_grants_status_check" CHECK ("consent_grants"."status" IN ('granted','active','revoked','expired'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "applicant_profiles" ADD CONSTRAINT "applicant_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_applicant_profiles_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_files" ADD CONSTRAINT "artifact_files_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_files" ADD CONSTRAINT "artifact_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_applicant_id_applicant_profiles_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_superseded_by_artifacts_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_applicant_id_applicant_profiles_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_animal_applicant_uq" ON "applications" USING btree ("animal_id","applicant_id");--> statement-breakpoint
CREATE INDEX "applications_shelter_status_idx" ON "applications" USING btree ("shelter_id","status");--> statement-breakpoint
CREATE INDEX "artifacts_applicant_idx" ON "artifacts" USING btree ("applicant_id","type","state");--> statement-breakpoint
CREATE INDEX "consent_grants_lookup_idx" ON "consent_grants" USING btree ("applicant_id","shelter_id","scope","status");