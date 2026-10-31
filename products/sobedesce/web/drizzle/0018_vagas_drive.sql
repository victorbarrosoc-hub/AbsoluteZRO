CREATE TABLE "vagas_drive" (
	"google_sub" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"usuario_id" text,
	"concedida_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "drive_acesso_total" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "drive_acesso_total_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vagas_drive" ADD CONSTRAINT "vagas_drive_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Vagas já usadas: Drives conectados com o escopo `drive` desde que o cliente passou para o projeto Google SOBEDESCE
-- (31/10/2026). Os de antes são do projeto antigo e não contam lá. Na dúvida, conta (vaga a mais é o lado seguro).
INSERT INTO "vagas_drive" ("google_sub", "email", "usuario_id", "concedida_em")
SELECT "google_sub", "email", "usuario_id", "atualizado_em" FROM "contas_google"
WHERE (' ' || "escopos" || ' ') LIKE '% https://www.googleapis.com/auth/drive %' AND "atualizado_em" >= '2026-10-31T00:00:00Z'
ON CONFLICT ("google_sub") DO NOTHING;--> statement-breakpoint
-- Quem já gastou vaga continua com o acesso total (nada muda para quem já usa).
UPDATE "usuarios" SET "drive_acesso_total" = true, "drive_acesso_total_em" = now()
WHERE "id" IN (SELECT "usuario_id" FROM "vagas_drive" WHERE "usuario_id" IS NOT NULL);