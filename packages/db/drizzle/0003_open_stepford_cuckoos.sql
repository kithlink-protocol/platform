CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"shelter_id" uuid NOT NULL,
	"performed_by" uuid,
	"method" text NOT NULL,
	"outcome" text NOT NULL,
	"notes_redacted" text,
	"call_log_url" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	CONSTRAINT "verifications_method_check" CHECK ("verifications"."method" IN ('landlord_call','clinic_api','document_audit','automated','prior_verification')),
	CONSTRAINT "verifications_outcome_check" CHECK ("verifications"."outcome" IN ('confirmed','failed_contact','discrepancy','revoked'))
);
--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verifications_artifact_idx" ON "verifications" USING btree ("artifact_id","outcome");