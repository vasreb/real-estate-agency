CREATE TYPE "team_role" AS ENUM ('member', 'admin');
CREATE TYPE "deal_type" AS ENUM ('sale', 'rental');
CREATE TYPE "document_type" AS ENUM ('contract', 'amendment', 'listing_sheet', 'handover_report', 'other');
CREATE TYPE "document_status" AS ENUM ('draft', 'signed', 'unknown');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "password_hash" TEXT NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "sessions" (
  "token_hash" CHAR(64) NOT NULL,
  "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash"),
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

CREATE TABLE "teams" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "team_members" (
  "team_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "team_role" NOT NULL,
  CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id"),
  CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

CREATE TABLE "clients" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "properties" (
  "id" UUID NOT NULL,
  "address" TEXT NOT NULL,
  CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "deals" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "type" "deal_type" NOT NULL,
  "client_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  CONSTRAINT "deals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "deals_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "deals_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "deals_team_id_number_key" ON "deals"("team_id", "number");

CREATE TABLE "documents" (
  "id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "parent_document_id" UUID,
  "type" "document_type" NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "document_number" VARCHAR(255),
  "document_date" DATE,
  "effective_from" DATE,
  "status" "document_status" NOT NULL DEFAULT 'unknown',
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_data" BYTEA NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documents_not_self_parent" CHECK ("parent_document_id" IS NULL OR "parent_document_id" <> "id"),
  CONSTRAINT "documents_only_amendment_parent" CHECK ("parent_document_id" IS NULL OR "type" = 'amendment')
);
CREATE UNIQUE INDEX "documents_deal_id_id_key" ON "documents"("deal_id", "id");
CREATE INDEX "documents_deal_id_parent_document_id_idx" ON "documents"("deal_id", "parent_document_id");
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_same_deal_fk"
  FOREIGN KEY ("deal_id", "parent_document_id") REFERENCES "documents"("deal_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
