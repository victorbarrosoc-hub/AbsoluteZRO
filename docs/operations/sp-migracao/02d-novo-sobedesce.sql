-- Absolute ZRO · mudança do banco para São Paulo · passo 2d: SOBEDESCE: 0000_contas a 0015_auditoria_zro
-- RODE NO PROJETO: AbsoluteZRO-SP (São Paulo, ref njvhgycmbuhimxovxuqj)  <-- o NOVO. Nunca no AbsoluteZRO antigo.
-- Gerado das migrations do repositório (origin/main). Não edite à mão.
-- Roda inteiro de uma vez: se der erro, nada fica pela metade (o bloco volta atrás sozinho).
do $guarda$ begin if not exists (select 1 from pg_namespace where nspname = 'sobedesce') then raise exception 'PARE: rode antes o passo 2a (ou você está no projeto errado).'; end if; end $guarda$;
do $guarda$ begin if to_regclass('"sobedesce"."__drizzle_migrations"') is not null then raise exception 'PARE: o sobedesce já tem migrações aqui. Esta parte já foi feita, ou este é o projeto antigo.'; end if; end $guarda$;
set local role sobedesce_app;
create table if not exists "sobedesce"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint);

-- ===== 0000_contas =====
set local search_path to "sobedesce";
CREATE TABLE "codigos_dispositivo" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"segredo_hash" text NOT NULL,
	"nome" text NOT NULL,
	"plataforma" text,
	"usuario_id" text,
	"aprovado_em" timestamp with time zone,
	"usado_em" timestamp with time zone,
	"consultado_em" timestamp with time zone,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codigos_dispositivo_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "codigos_dispositivo_segredoHash_unique" UNIQUE("segredo_hash")
);;
CREATE TABLE "contas_google" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"nome" text,
	"foto_url" text,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_expira_em" timestamp with time zone,
	"escopos" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT 'ok' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_google_googleSub_unique" UNIQUE("google_sub")
);;
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"tipo" text NOT NULL,
	"nome" text,
	"plataforma" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"revogada_em" timestamp with time zone,
	CONSTRAINT "sessoes_tokenHash_unique" UNIQUE("token_hash")
);;
CREATE TABLE "tentativas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tentativas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chave" text NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);;
CREATE TABLE "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"senha_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_login_em" timestamp with time zone,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);;
ALTER TABLE "codigos_dispositivo" ADD CONSTRAINT "codigos_dispositivo_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "contas_google" ADD CONSTRAINT "contas_google_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "contas_google_usuario_idx" ON "contas_google" USING btree ("usuario_id");;
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id");;
CREATE INDEX "tentativas_chave_quando_idx" ON "tentativas" USING btree ("chave","quando");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('c3266448d6d487c2bd5cd3e07198ec20305ebf3eccc324c73b0f703965aca865', 1792148438194);

-- ===== 0001_redefinir_senha =====
set local search_path to "sobedesce";
CREATE TABLE "redefinicoes_senha" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redefinicoes_senha_tokenHash_unique" UNIQUE("token_hash")
);;
ALTER TABLE "redefinicoes_senha" ADD CONSTRAINT "redefinicoes_senha_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "redefinicoes_senha_usuario_idx" ON "redefinicoes_senha" USING btree ("usuario_id");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('0fc5feda0b354dacb6619a723cc955ce676b3b7502fa6860b27b284dd67ff484', 1792150364572);

-- ===== 0002_referencias =====
set local search_path to "sobedesce";
CREATE TABLE "atalhos" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	CONSTRAINT "atalhos_tokenHash_unique" UNIQUE("token_hash")
);;
CREATE TABLE "colecoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"conta_google_id" text NOT NULL,
	"drive_folder_id" text NOT NULL,
	"nome" text NOT NULL,
	"nome_chave" text NOT NULL,
	"publica_token" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colecoes_publicaToken_unique" UNIQUE("publica_token")
);;
CREATE TABLE "referencias_fila" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"colecao_id" text NOT NULL,
	"url" text NOT NULL,
	"nota" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"erro" text,
	"drive_file_id" text,
	"dispositivo_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);;
ALTER TABLE "contas_google" ADD COLUMN "referencias_pasta_id" text;;
ALTER TABLE "usuarios" ADD COLUMN "plano" text DEFAULT 'gratis' NOT NULL;;
ALTER TABLE "atalhos" ADD CONSTRAINT "atalhos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "colecoes" ADD CONSTRAINT "colecoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "colecoes" ADD CONSTRAINT "colecoes_conta_google_id_contas_google_id_fk" FOREIGN KEY ("conta_google_id") REFERENCES "sobedesce"."contas_google"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "referencias_fila" ADD CONSTRAINT "referencias_fila_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "referencias_fila" ADD CONSTRAINT "referencias_fila_colecao_id_colecoes_id_fk" FOREIGN KEY ("colecao_id") REFERENCES "sobedesce"."colecoes"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "atalhos_usuario_idx" ON "atalhos" USING btree ("usuario_id");;
CREATE INDEX "colecoes_usuario_idx" ON "colecoes" USING btree ("usuario_id");;
CREATE UNIQUE INDEX "colecoes_usuario_nome_idx" ON "colecoes" USING btree ("usuario_id","nome_chave");;
CREATE INDEX "referencias_fila_usuario_status_idx" ON "referencias_fila" USING btree ("usuario_id","status");;
CREATE INDEX "referencias_fila_colecao_idx" ON "referencias_fila" USING btree ("colecao_id");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('2960970c26c4aade70abcddad1ddbf7e78879c8391245d2a26895b947817e9c7', 1792172652979);

-- ===== 0003_acompanhar =====
set local search_path to "sobedesce";
CREATE TABLE "dispositivo_status" (
	"sessao_id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"avisado" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);;
CREATE TABLE "push_inscricoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio_em" timestamp with time zone,
	"falhas" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "push_inscricoes_endpoint_unique" UNIQUE("endpoint")
);;
ALTER TABLE "dispositivo_status" ADD CONSTRAINT "dispositivo_status_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "sobedesce"."sessoes"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "dispositivo_status" ADD CONSTRAINT "dispositivo_status_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "dispositivo_status_usuario_idx" ON "dispositivo_status" USING btree ("usuario_id");;
CREATE INDEX "dispositivo_status_atualizado_idx" ON "dispositivo_status" USING btree ("atualizado_em");;
CREATE INDEX "push_inscricoes_usuario_idx" ON "push_inscricoes" USING btree ("usuario_id");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('b30cde2c98592384c90aeba1ec16fdec27fb256b5d0109523407cf7dc01fbcfe', 1792175834918);

-- ===== 0004_login_google =====
set local search_path to "sobedesce";
ALTER TABLE "codigos_dispositivo" ADD COLUMN "pedido_ip" text;;
ALTER TABLE "codigos_dispositivo" ADD COLUMN "pedido_cidade" text;;
ALTER TABLE "codigos_dispositivo" ADD COLUMN "pedido_pais" text;;
ALTER TABLE "contas_google" ADD COLUMN "login_permitido" boolean DEFAULT false NOT NULL;;
ALTER TABLE "contas_google" ADD COLUMN "email_verificado" boolean DEFAULT false NOT NULL;;
-- Revisão A3: "Entrar com Google" passa a valer só pelo Google marcado para entrar (login_permitido).
-- Ninguém perde o login: cada conta com Drive fica com exatamente um Google de entrar. O banco não guardava qual
-- Google criou a conta; quem criou tem o mesmo e-mail da conta (o "Continuar com Google" grava o e-mail do Google
-- como e-mail da conta) e é o mais antigo dela. Então: primeiro o de mesmo e-mail da conta, senão o mais antigo.
UPDATE "contas_google" AS cg SET "login_permitido" = true
WHERE cg."id" IN (
	SELECT DISTINCT ON (c."usuario_id") c."id"
	FROM "contas_google" c JOIN "usuarios" u ON u."id" = c."usuario_id"
	ORDER BY c."usuario_id", (lower(c."email") = u."email") DESC, c."criado_em" ASC, c."id" ASC
);;
-- Restinho do A2: o e-mail confirmado pelo Google só é conhecido de agora em diante (ao conectar ou entrar).
-- Já confirmado: o Google que criou a conta (o "Continuar com Google" sempre exigiu email_verified) e que ainda
-- tem o e-mail da conta.
UPDATE "contas_google" AS cg SET "email_verificado" = true
FROM "usuarios" u
WHERE u."id" = cg."usuario_id" AND u."senha_hash" = 'google' AND lower(cg."email") = u."email";;
CREATE UNIQUE INDEX "contas_google_login_idx" ON "contas_google" USING btree ("usuario_id") WHERE "contas_google"."login_permitido";
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('eeb2ae94f52637cb5fab9f12da7b656f61d0a6d14e2a5e964c9b834b69cb28b4', 1792235570713);

-- ===== 0005_aparelhos =====
set local search_path to "sobedesce";
CREATE TABLE "aparelhos" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"aparelho_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"visto_em" timestamp with time zone DEFAULT now() NOT NULL
);;
ALTER TABLE "aparelhos" ADD CONSTRAINT "aparelhos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
CREATE UNIQUE INDEX "aparelhos_usuario_aparelho_idx" ON "aparelhos" USING btree ("usuario_id","aparelho_hash");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('e5736b02b96bfc6a8583052c133fe3726c1a98fb31ce185f0ffdd56da7f23a17', 1792239137267);

-- ===== 0006_uso_admin =====
set local search_path to "sobedesce";
CREATE TABLE "atividade_diaria" (
	"usuario_id" text NOT NULL,
	"dia" date NOT NULL,
	"site" boolean DEFAULT false NOT NULL,
	"celular" boolean DEFAULT false NOT NULL,
	"computador" boolean DEFAULT false NOT NULL,
	"ultima_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_origem" text,
	CONSTRAINT "atividade_diaria_usuario_id_dia_pk" PRIMARY KEY("usuario_id","dia")
);;
CREATE TABLE "avisos_admin" (
	"chave" text PRIMARY KEY NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);;
CREATE TABLE "uso_diario" (
	"sessao_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"dia" date NOT NULL,
	"enviados_bytes" bigint DEFAULT 0 NOT NULL,
	"baixados_bytes" bigint DEFAULT 0 NOT NULL,
	"enviados" integer DEFAULT 0 NOT NULL,
	"baixados" integer DEFAULT 0 NOT NULL,
	"erros" integer DEFAULT 0 NOT NULL,
	"maior_arquivo" bigint DEFAULT 0 NOT NULL,
	"ms_ativo" bigint DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uso_diario_sessao_id_dia_pk" PRIMARY KEY("sessao_id","dia")
);;
ALTER TABLE "sessoes" ADD COLUMN "app_build" integer;;
ALTER TABLE "atividade_diaria" ADD CONSTRAINT "atividade_diaria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "uso_diario" ADD CONSTRAINT "uso_diario_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "sobedesce"."sessoes"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "uso_diario" ADD CONSTRAINT "uso_diario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "atividade_diaria_dia_idx" ON "atividade_diaria" USING btree ("dia");;
CREATE INDEX "uso_diario_usuario_dia_idx" ON "uso_diario" USING btree ("usuario_id","dia");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('1e7936bb5b4f71c14a4ad9b573955634aaab281020353ad98f73ae0d9e313158', 1792358598723);

-- ===== 0007_pedidos_proxy =====
set local search_path to "sobedesce";
CREATE TABLE "pedidos_proxy" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"conta_google_id" text NOT NULL,
	"file_id" text NOT NULL,
	"nome" text NOT NULL,
	"tamanho" bigint,
	"status" text DEFAULT 'pendente' NOT NULL,
	"erro" text,
	"resultado" text,
	"proxy_file_id" text,
	"dispositivo_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);;
ALTER TABLE "pedidos_proxy" ADD CONSTRAINT "pedidos_proxy_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "pedidos_proxy" ADD CONSTRAINT "pedidos_proxy_conta_google_id_contas_google_id_fk" FOREIGN KEY ("conta_google_id") REFERENCES "sobedesce"."contas_google"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "pedidos_proxy_usuario_status_idx" ON "pedidos_proxy" USING btree ("usuario_id","status");;
CREATE INDEX "pedidos_proxy_arquivo_idx" ON "pedidos_proxy" USING btree ("usuario_id","file_id");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('3c43ec67a562d56219a9334ac7f7113bc289fd247bb5825d58bce84df8eb0b78', 1792384978529);

-- ===== 0008_pedidos_tipo =====
set local search_path to "sobedesce";
ALTER TABLE "pedidos_proxy" ADD COLUMN "tipo" text DEFAULT 'proxy' NOT NULL;;
ALTER TABLE "pedidos_proxy" ADD COLUMN "ajustes" jsonb;
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('5fc7e444a88cbff3df4576bd204b78553981b733e0c93fef7c65bb05b661d35f', 1792467492954);

-- ===== 0009_lan_presenca =====
set local search_path to "sobedesce";
CREATE TABLE "lan_presenca" (
	"sessao_id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"enderecos" jsonb NOT NULL,
	"porta" integer NOT NULL,
	"chave_enc" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);;
ALTER TABLE "lan_presenca" ADD CONSTRAINT "lan_presenca_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "sobedesce"."sessoes"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "lan_presenca" ADD CONSTRAINT "lan_presenca_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "lan_presenca_usuario_idx" ON "lan_presenca" USING btree ("usuario_id");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('5aa17f365cc29b20dc30238fe93ee09a1dfb41d5adebdfd38964e0067bc0bebd', 1792534434939);

-- ===== 0010_lan_outras_contas =====
set local search_path to "sobedesce";
ALTER TABLE "lan_presenca" ADD COLUMN "chave_publica" text;;
ALTER TABLE "lan_presenca" ADD COLUMN "aceita_outros" boolean DEFAULT false NOT NULL;;
ALTER TABLE "lan_presenca" ADD COLUMN "rede" text;;
CREATE INDEX "lan_presenca_rede_idx" ON "lan_presenca" USING btree ("rede");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('1b0b77806051c8e5ec0262aa1d6753631006e7abe66fef4d16f0e42242790c3e', 1792536251744);

-- ===== 0011_p2p =====
set local search_path to "sobedesce";
CREATE TABLE "p2p_aparelhos" (
	"sessao_id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"rede" text,
	"aceita_outros" boolean DEFAULT false NOT NULL,
	"visto_em" timestamp with time zone DEFAULT now() NOT NULL
);;
CREATE TABLE "p2p_sinais" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"para_usuario" text NOT NULL,
	"de_sessao" text NOT NULL,
	"para_sessao" text NOT NULL,
	"tipo" text NOT NULL,
	"oferta" text,
	"sdp" text,
	"resumo" jsonb,
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"entregue_em" timestamp with time zone
);;
ALTER TABLE "p2p_aparelhos" ADD CONSTRAINT "p2p_aparelhos_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "sobedesce"."sessoes"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "p2p_aparelhos" ADD CONSTRAINT "p2p_aparelhos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "p2p_sinais" ADD CONSTRAINT "p2p_sinais_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "p2p_sinais" ADD CONSTRAINT "p2p_sinais_para_usuario_usuarios_id_fk" FOREIGN KEY ("para_usuario") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "p2p_sinais" ADD CONSTRAINT "p2p_sinais_de_sessao_sessoes_id_fk" FOREIGN KEY ("de_sessao") REFERENCES "sobedesce"."sessoes"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "p2p_sinais" ADD CONSTRAINT "p2p_sinais_para_sessao_sessoes_id_fk" FOREIGN KEY ("para_sessao") REFERENCES "sobedesce"."sessoes"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "p2p_aparelhos_usuario_idx" ON "p2p_aparelhos" USING btree ("usuario_id","visto_em");;
CREATE INDEX "p2p_aparelhos_rede_idx" ON "p2p_aparelhos" USING btree ("rede","visto_em");;
CREATE INDEX "p2p_sinais_para_idx" ON "p2p_sinais" USING btree ("para_sessao","entregue_em");;
CREATE INDEX "p2p_sinais_criado_idx" ON "p2p_sinais" USING btree ("criado_em");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('f6bf8f684c3507ea2d71ea6c2944e55537feb4c3b14dfce632202a6edf298694', 1792544816626);

-- ===== 0012_referencias_formatos =====
set local search_path to "sobedesce";
ALTER TABLE "referencias_fila" ADD COLUMN "formatos" jsonb;
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('ef1a2c993d3737fe03d403312f0663c3c2d65a49a510d4dc0edf121cd91b5cd2', 1792837748217);

-- ===== 0013_contas_zro =====
set local search_path to "sobedesce";
CREATE TABLE "contas_zro" (
	"usuario_id" text PRIMARY KEY NOT NULL,
	"zro_sub" text NOT NULL,
	"email" text NOT NULL,
	"produtos" text DEFAULT '' NOT NULL,
	"organizacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_login_em" timestamp with time zone,
	CONSTRAINT "contas_zro_zroSub_unique" UNIQUE("zro_sub")
);;
ALTER TABLE "contas_zro" ADD CONSTRAINT "contas_zro_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('101942182e0f412aa674d1909926477f0209359a00690176b5b96fb2cba07a7f', 1792930170273);

-- ===== 0014_ia_da_zro =====
set local search_path to "sobedesce";
ALTER TABLE "contas_zro" ADD COLUMN "ia" text;
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('c8bff2656b29c6c4b7ba8092fe2eaf29e91c8e8de19b2701f1fea2d87c4faff0', 1793117370591);

-- ===== 0015_auditoria_zro =====
set local search_path to "sobedesce";
CREATE TABLE "auditoria_zro" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_zro_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" text,
	"zro_sub" text NOT NULL,
	"acao" text NOT NULL,
	"alvo" text,
	"resultado" text NOT NULL,
	"jti" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);;
ALTER TABLE "auditoria_zro" ADD CONSTRAINT "auditoria_zro_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "sobedesce"."usuarios"("id") ON DELETE cascade ON UPDATE no action;;
CREATE INDEX "auditoria_zro_usuario_idx" ON "auditoria_zro" USING btree ("usuario_id","criado_em");
;
insert into "sobedesce"."__drizzle_migrations" (hash, created_at) values ('b09b0dc398a3c7918dd888e8a5f1f5b65540d85ea0625b6436e9bc0565821cd1', 1793232168456);

-- ===== fora das migrations: registro da cópia Neon -> Supabase (src/lib/db/copia-neon.ts) e permissão explícita
create table if not exists "sobedesce"."_copia_neon" (tabela text primary key, linhas bigint not null, md5 text not null, copiado_em timestamptz not null default now());
grant usage, create on schema sobedesce to sobedesce_app;
reset role;

select 'ok: 02d-novo-sobedesce.sql feito. Siga para o próximo arquivo.' as resultado;
