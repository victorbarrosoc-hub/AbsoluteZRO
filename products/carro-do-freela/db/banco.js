/**
 * O BANCO DO CARRO (28/out) — Supabase AbsoluteZRO, schema `carro_do_freela`, papel de
 * login `carro_do_freela` (dono das tabelas novas, roda as migrações) e papel sem login
 * `carro_do_freela_app` (o servidor assume em toda operação de pessoa; o RLS vale sempre).
 *
 * Duas portas, e só duas (o mesmo desenho do Maestro e do HUB):
 *  - asUser(sub, fn): abre a transação, grava `carro_do_freela.sub` (set_config local)
 *    e faz SET LOCAL ROLE carro_do_freela_app. A pessoa só enxerga as linhas dela, mesmo
 *    se a conferência do servidor falhar.
 *  - asSystem(motivo, fn): dono do schema, sem RLS. Só para a migração e o
 *    publicador da fila de sincronização (db/sync.js).
 *
 * Endereço: CARRO_DATABASE_URL (produção: pooler de SESSÃO do Supabase,
 * projeto AbsoluteZRO-SP, aws-<n>-sa-east-1.pooler.supabase.com:5432, usuário
 * `carro_do_freela.<project_ref>`).
 * Nunca no fonte. Sem a variável, o banco está DESLIGADO e as rotas
 * respondem 503 `sem_banco` — o resto do Carro segue igual.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAPEL_APP = 'carro_do_freela_app';
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

function databaseUrl(env = process.env) {
  const v = String(env.CARRO_DATABASE_URL || '').trim();
  return /^postgres(ql)?:\/\//.test(v) ? v : null;
}

/** só `sslmode` passa (parâmetro extra de integração vira parâmetro de sessão e o pooler recusa); remoto sem ele exige TLS */
function normalizarUrl(raw) {
  let u;
  try { u = new URL(raw) } catch (e) { return { connectionString: raw } }
  const sslmode = u.searchParams.get('sslmode');
  for (const k of [...u.searchParams.keys()]) u.searchParams.delete(k);
  const local = HOSTS_LOCAIS.has(u.hostname);
  const ssl = sslmode === 'disable' || (local && !sslmode) ? false : { rejectUnauthorized: false };
  return { connectionString: u.toString(), ssl };
}

/** nome curto e seguro do banco para o log (sem senha) */
function rotulo(url) {
  try {
    const u = new URL(url);
    const ref = (decodeURIComponent(u.username).match(/^[a-z_][a-z0-9_]*\.([a-z0-9]+)$/) || [])[1];
    return ref ? ref + ' (Supabase)' : u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch (e) {
    return 'endereço inválido';
  }
}

function criarBanco(url, opcoes = {}) {
  const { Pool } = require('pg');
  const pool = new Pool(Object.assign(normalizarUrl(url), {
    max: opcoes.max || 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    application_name: 'carro-do-freela',
  }));
  pool.on('error', () => {});

  async function transacao(preparar, fn) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await preparar(c);
      const r = await fn(c);
      await c.query('commit');
      return r;
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  return {
    pool,
    asUser(sub, fn) {
      if (!UUID.test(String(sub))) return Promise.reject(new Error('asUser: sub inválido'));
      return transacao(async c => {
        await c.query("select set_config('carro_do_freela.sub', $1, true)", [String(sub).toLowerCase()]);
        await c.query('set local role ' + PAPEL_APP);
      }, fn);
    },
    asSystem(motivo, fn) {
      if (opcoes.aoSistema) opcoes.aoSistema(motivo);
      return transacao(async () => {}, fn);
    },
    fechar: () => pool.end(),
  };
}

/* uma conexão por instância da função (a Vercel reaproveita a instância quente) */
let compartilhado = null;
function banco(env = process.env) {
  const url = databaseUrl(env);
  if (!url) return null;
  if (!compartilhado || compartilhado.url !== url) compartilhado = { url, b: criarBanco(url) };
  return compartilhado.b;
}
async function fecharCompartilhado() {
  if (compartilhado) await compartilhado.b.fechar().catch(() => {});
  compartilhado = null;
}

module.exports = { UUID, PAPEL_APP, databaseUrl, normalizarUrl, rotulo, criarBanco, banco, fecharCompartilhado };
