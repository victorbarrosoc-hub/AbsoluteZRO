#!/usr/bin/env node
/**
 * `npm run db:migrate` — aplica as migrações pendentes do schema `carro_do_freela`
 * (db/migrations/*.sql) no banco de CARRO_DATABASE_URL. Roda também no build
 * da Vercel (src/vercel-build.js), SÓ quando a variável existe; sem ela o
 * build segue sem banco, como sempre foi.
 * Migração já aplicada nunca é editada: se o sha256 divergir, para aqui,
 * antes de publicar um site com o banco diferente do código.
 */
const { Client } = require('pg');
const { databaseUrl, normalizarUrl, rotulo } = require('./banco.js');
const { migrar, SCHEMA } = require('./migrador.js');

async function rodar(env = process.env) {
  const url = databaseUrl(env);
  if (!url) throw new Error('Defina CARRO_DATABASE_URL (postgres://…). Nada foi feito.');
  const c = new Client(Object.assign(normalizarUrl(url), { application_name: 'carro-do-freela:migracao' }));
  await c.connect();
  try {
    const feitas = await migrar(c);
    return feitas.length
      ? `Migrações aplicadas em ${rotulo(url)} (schema ${SCHEMA}): ${feitas.join(', ')}`
      : `Schema ${SCHEMA} em dia em ${rotulo(url)}.`;
  } finally {
    await c.end().catch(() => {});
  }
}

if (require.main === module)
  rodar().then(m => console.log(m), e => { console.error('Migração recusada: ' + e.message); process.exit(1) });

module.exports = { rodar };
