/**
 * Aplica as migrações pendentes no schema `maestro` (drizzle/*.sql, journal em drizzle/meta/_journal.json).
 * Uso: npm run db:migrate (precisa de MAESTRO_DATABASE_URL ou DATABASE_URL). Roda também no vercel-build.
 * Uma migração aplicada nunca é editada: se o hash divergir, para antes de publicar.
 */
import postgres from "postgres";
import { databaseLabel, databaseUrl, normalizarUrl, SCHEMA } from "../src/lib/db/config";
import { conferirMigracoes, migrarNoSchema } from "../src/lib/db/migrador";

const url = databaseUrl();
if (!url) {
  console.error("Defina MAESTRO_DATABASE_URL (ou DATABASE_URL). Veja .env.example.");
  process.exit(1);
}
const sql = postgres(normalizarUrl(url), { max: 1, prepare: false, onnotice: () => {} });
try {
  const divergentes = await conferirMigracoes(sql, "./drizzle", SCHEMA).catch(() => [] as string[]);
  if (divergentes.length) throw new Error(`migração já aplicada foi editada: ${divergentes.join(", ")}. Crie uma migração nova.`);
  const aplicadas = await migrarNoSchema(sql, "./drizzle", SCHEMA);
  console.log(
    aplicadas.length
      ? `Migrações aplicadas em ${databaseLabel(url)} (schema ${SCHEMA}): ${aplicadas.join(", ")}`
      : `Schema ${SCHEMA} em dia em ${databaseLabel(url)}.`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
