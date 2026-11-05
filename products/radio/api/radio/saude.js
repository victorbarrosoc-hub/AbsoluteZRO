// GET /api/radio/saude — o banco responde? Só para conferir o deploy e a conexão (pooler do Supabase). Não lê nada de
// ninguém e não diz o que é o app: { ok } e, com o banco de pé, quantas migrações foram aplicadas.
import { banco, nuvemLigada } from '../_banco.js'
import { json } from '../_zro.js'

export default async function saude(req, res) {
  if (!nuvemLigada()) return json(res, 200, { ok: false })
  try {
    const [r] = await banco()`select count(*)::int as n from radio.migracoes`
    return json(res, 200, { ok: true, migracoes: r.n })
  } catch (e) {
    return json(res, 200, { ok: false, erro: String(e?.code || 'erro').slice(0, 40) })
  }
}
