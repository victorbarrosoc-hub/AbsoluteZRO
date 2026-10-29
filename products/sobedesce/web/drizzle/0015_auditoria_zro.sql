CREATE TABLE "auditoria_zro" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_zro_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" text,
	"zro_sub" text NOT NULL,
	"acao" text NOT NULL,
	"alvo" text,
	"resultado" text NOT NULL,
	"jti" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria_zro" ADD CONSTRAINT "auditoria_zro_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_zro_usuario_idx" ON "auditoria_zro" USING btree ("usuario_id","criado_em");