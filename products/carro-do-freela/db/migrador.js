/**
 * O MIGRADOR DO SCHEMA `carro_do_freela` (29/out) — no molde do Maestro
 * (products/maestro/src/lib/db/migrador.ts), em CommonJS e só com `pg`.
 *
 * As migrações são arquivos `db/migrations/NNNN_nome.sql`, aplicados na ordem
 * do nome. O diário fica no próprio banco, em `carro_do_freela.__migracoes` (tag, sha256
 * do arquivo, quando). Três recusas, todas ANTES de aplicar qualquer coisa:
 *   1. arquivo de migração já aplicada foi EDITADO (o sha256 mudou);
 *   2. migração aplicada SUMIU da pasta;
 *   3. arquivo novo com nome que vem ANTES da última aplicada (inserido no
 *      passado: ele nunca rodaria em quem já está à frente).
 * Mudou o banco? Arquivo NOVO, sempre. Cada migração roda na própria
 * transação, com o search_path no schema, e duas execuções ao mesmo tempo
 * (dois deploys) esperam uma pela outra (trava consultiva).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA = 'carro_do_freela';
const PASTA = path.join(__dirname, 'migrations');
const NOME = /^(\d{4})_[a-z0-9_]+\.sql$/;
const TRAVA = 'carro_do_freela:migracoes';

/** as migrações da pasta, na ordem, com o SQL e o sha256 de cada arquivo */
function lerMigracoes(pasta = PASTA) {
  const nomes = fs.readdirSync(pasta).filter(n => n.endsWith('.sql')).sort();
  const ruins = nomes.filter(n => !NOME.test(n));
  if (ruins.length) throw new Error('nome de migração fora do padrão NNNN_nome.sql: ' + ruins.join(', '));
  return nomes.map(n => {
    const sql = fs.readFileSync(path.join(pasta, n), 'utf8');
    return { tag: n.replace(/\.sql$/, ''), sql, hash: crypto.createHash('sha256').update(sql).digest('hex') };
  });
}

async function diario(client) {
  /* criar o schema pede CREATE no banco; se ele já existe, não pede nada */
  const { rows } = await client.query('select 1 from pg_namespace where nspname = $1', [SCHEMA]);
  if (!rows.length) await client.query(`create schema ${SCHEMA}`);
  await client.query(`create table if not exists ${SCHEMA}."__migracoes" (tag text primary key, sha256 text not null, aplicada_em timestamptz not null default now())`);
  await client.query(`revoke all on ${SCHEMA}."__migracoes" from public`);
}

/** o que impede migrar: lista de problemas (vazia = pode seguir) */
function conferir(migracoes, aplicadas) {
  const problemas = [];
  const daPasta = new Map(migracoes.map(m => [m.tag, m]));
  for (const a of aplicadas) {
    const m = daPasta.get(a.tag);
    if (!m) problemas.push(`migração aplicada ${a.tag} sumiu da pasta`);
    else if (m.hash !== a.sha256) problemas.push(`migração já aplicada foi editada: ${a.tag}. Crie uma migração nova.`);
  }
  const ultima = aplicadas.map(a => a.tag).sort().pop();
  const feitas = new Set(aplicadas.map(a => a.tag));
  for (const m of migracoes)
    if (!feitas.has(m.tag) && ultima && m.tag < ultima) problemas.push(`migração nova ${m.tag} vem antes da última aplicada (${ultima}): renomeie com número maior`);
  return problemas;
}

/**
 * Aplica as pendentes. `client` é um pg.Client (ou PoolClient) já conectado.
 * Devolve as tags aplicadas agora (vazio = em dia). Lança erro se conferir() achar problema.
 */
async function migrar(client, pasta = PASTA) {
  const migracoes = lerMigracoes(pasta);
  await client.query('select pg_advisory_lock(hashtext($1))', [TRAVA]);
  try {
    await diario(client);
    const { rows: aplicadas } = await client.query(`select tag, sha256 from ${SCHEMA}."__migracoes" order by tag`);
    const problemas = conferir(migracoes, aplicadas);
    if (problemas.length) throw new Error(problemas.join('\n'));
    const feitas = new Set(aplicadas.map(a => a.tag));
    const agora = [];
    for (const m of migracoes) {
      if (feitas.has(m.tag)) continue;
      await client.query('begin');
      try {
        await client.query(`set local search_path to ${SCHEMA}, pg_catalog`);
        await client.query(m.sql);
        await client.query(`insert into ${SCHEMA}."__migracoes" (tag, sha256) values ($1, $2)`, [m.tag, m.hash]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback').catch(() => {});
        e.message = `migração ${m.tag}: ${e.message}`;
        throw e;
      }
      agora.push(m.tag);
    }
    return agora;
  } finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', [TRAVA]).catch(() => {});
  }
}

module.exports = { SCHEMA, PASTA, lerMigracoes, conferir, migrar };
