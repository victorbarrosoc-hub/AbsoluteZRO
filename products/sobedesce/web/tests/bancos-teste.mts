/**
 * Dois bancos Postgres para os testes do migrador com schema e da cópia do Neon.
 * - Com TEST_DATABASE_URL (Postgres de verdade, ex.: o do CI): duas conexões no mesmo banco, cada teste com schemas
 *   de nome aleatório, apagados no fim.
 * - Sem ela: dois PGlite em memória, cada um atrás de um servidor local (o mesmo do `npm run dev`), para fazer o papel
 *   de dois bancos diferentes (origem e destino).
 */
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";

export type Bancos = {
  tipo: "postgres" | "pglite";
  origem: postgres.Sql;
  destino: postgres.Sql;
  /** Nome de schema novo e único (letras minúsculas, números e _). */
  novoSchema(prefixo: string): string;
  fechar(): Promise<void>;
};

const opcoes = { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 15, onnotice: () => {} } as const;

export async function abrirBancos(): Promise<Bancos> {
  const criados: { sql: postgres.Sql; schema: string }[] = [];
  const novoSchema = (prefixo: string) => `${prefixo}_${randomBytes(4).toString("hex")}`;

  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const origem = postgres(url, opcoes);
    const destino = postgres(url, opcoes);
    return {
      tipo: "postgres",
      origem,
      destino,
      novoSchema(prefixo) {
        const s = novoSchema(prefixo);
        criados.push({ sql: origem, schema: s });
        return s;
      },
      async fechar() {
        for (const { sql, schema } of criados) await sql.unsafe(`drop schema if exists "${schema}" cascade`).catch(() => {});
        await Promise.all([origem.end({ timeout: 5 }), destino.end({ timeout: 5 })]);
      },
    };
  }

  console.warn("TEST_DATABASE_URL não definida: testes do banco com schema rodando em dois PGlite em memória.");
  const servidores: { pg: PGlite; servidor: PGLiteSocketServer; sql: postgres.Sql }[] = [];
  for (let i = 0; i < 2; i++) {
    const pg = await PGlite.create("memory://");
    const servidor = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
    await servidor.start();
    const sql = postgres(`postgres://postgres:postgres@${servidor.getServerConn()}/postgres`, opcoes);
    servidores.push({ pg, servidor, sql });
  }
  return {
    tipo: "pglite",
    origem: servidores[0].sql,
    destino: servidores[1].sql,
    novoSchema,
    async fechar() {
      for (const { pg, servidor, sql } of servidores) {
        await sql.end({ timeout: 5 }).catch(() => {});
        await servidor.stop().catch(() => {});
        await pg.close().catch(() => {});
      }
    },
  };
}
