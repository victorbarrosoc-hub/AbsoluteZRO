ALTER TABLE "pedidos_proxy" ADD COLUMN "chave" text;--> statement-breakpoint
ALTER TABLE "pedidos_proxy" ADD COLUMN "frac" real;--> statement-breakpoint
ALTER TABLE "pedidos_proxy" ADD COLUMN "saida" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_proxy_chave_idx" ON "pedidos_proxy" USING btree ("usuario_id","chave") WHERE "pedidos_proxy"."chave" is not null and "pedidos_proxy"."status" in ('pendente', 'gerando', 'pronto');