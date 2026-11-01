// GET /api/rift/saude — o banco do Rift responde? Para conferir o deploy e a conexão (pooler do Supabase). Não lê nada
// de ninguém: só `select 1` e quantas migrações foram aplicadas.
import { json } from '../_zro.js'
import { banco, nuvemLigada } from '../_banco.js'

export default async function saude(req, res) {
  if (!nuvemLigada()) return json(res, 200, { ok: false, nuvem: false })
  try {
    const [r] = await banco()`select count(*)::int as n from rift.migracoes`
    return json(res, 200, { ok: true, nuvem: true, migracoes: r.n })
  } catch (e) {
    return json(res, 200, { ok: false, nuvem: true, erro: String(e?.code || '') + ' ' + String(e?.message || '').slice(0, 120) })
  }
}
