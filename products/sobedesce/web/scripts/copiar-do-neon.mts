/**
 * Cópia única do Neon para o Supabase da Absolute ZRO (src/lib/db/copia-neon.ts). Roda no vercel-build, depois das
 * migrações e antes do next build. Só age com SOBEDESCE_COPIAR_DE (o endereço do Neon) definida; sem ela, não faz nada.
 *
 * Destino: SOBEDESCE_DATABASE_URL, schema SOBEDESCE_DATABASE_SCHEMA. Origem: schema "public" do SOBEDESCE_COPIAR_DE.
 * Qualquer erro ou divergência sai com código 1: o build falha e o deploy anterior continua no ar.
 * O log só mostra nomes de tabela, contagens e "ok/divergiu" (nunca dados nem endereços).
 *
 * Uso manual: npm run db:copiar-do-neon (mesmas variáveis).
 */
import postgres from "postgres";
import { databaseLabel, databaseSchema, postgresUrl } from "../src/lib/db/config";
import { copiarDoNeon, ErroCopia } from "../src/lib/db/copia-neon";

const ehPostgres = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//.test(v);

async function main() {
  const origemUrl = process.env.SOBEDESCE_COPIAR_DE?.trim();
  if (!origemUrl) {
    console.log("copiar-do-neon: SOBEDESCE_COPIAR_DE não definida; nada a copiar.");
    return;
  }
  const destinoUrl = process.env.SOBEDESCE_DATABASE_URL?.trim();
  if (!ehPostgres(origemUrl)) throw new ErroCopia("SOBEDESCE_COPIAR_DE não é um endereço postgres://");
  if (!ehPostgres(destinoUrl)) throw new ErroCopia("a cópia precisa de SOBEDESCE_DATABASE_URL (o banco novo)");
  const schemaDestino = databaseSchema();
  if (!schemaDestino) throw new ErroCopia("a cópia precisa de SOBEDESCE_DATABASE_SCHEMA (ex.: sobedesce)");
  const schemaOrigem = "public";
  if (databaseLabel(origemUrl) === databaseLabel(destinoUrl) && schemaOrigem === schemaDestino) {
    throw new ErroCopia("origem e destino são o mesmo banco e o mesmo schema");
  }
  console.log(`copiar-do-neon: de ${databaseLabel(origemUrl)} (public) para ${databaseLabel(destinoUrl)} (${schemaDestino}).`);

  const opcoes = { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} } as const;
  const origem = postgres(postgresUrl(origemUrl), opcoes);
  const destino = postgres(postgresUrl(destinoUrl), opcoes);
  try {
    await copiarDoNeon({ origem, destino, schemaOrigem, schemaDestino });
  } finally {
    await Promise.allSettled([origem.end({ timeout: 5 }), destino.end({ timeout: 5 })]);
  }
}

try {
  await main();
} catch (err) {
  // Erros do Postgres podem citar valores das linhas: no log vai só o código.
  const e = err as { code?: unknown; message?: unknown };
  const motivo = err instanceof ErroCopia ? String(e.message) : `erro ${typeof e.code === "string" ? e.code : "desconhecido"} no banco ou na conexão`;
  console.error(`copiar-do-neon: falhou (${motivo}). Nada foi gravado no destino; o deploy anterior continua no ar.`);
  process.exitCode = 1;
}
