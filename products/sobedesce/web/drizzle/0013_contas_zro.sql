CREATE TABLE "contas_zro" (
	"usuario_id" text PRIMARY KEY NOT NULL,
	"zro_sub" text NOT NULL,
	"email" text NOT NULL,
	"produtos" text DEFAULT '' NOT NULL,
	"organizacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_login_em" timestamp with time zone,
	CONSTRAINT "contas_zro_zroSub_unique" UNIQUE("zro_sub")
);
--> statement-breakpoint
ALTER TABLE "contas_zro" ADD CONSTRAINT "contas_zro_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;