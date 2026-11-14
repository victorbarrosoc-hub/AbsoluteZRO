// GET /api/cron/limpar — a limpeza agendada (vercel.json, `crons`: uma vez por dia, de madrugada no horário de
// Brasília). Só com `Authorization: Bearer <CRON_SECRET>` (a Vercel manda sozinha quando a variável existe), comparado
// em tempo constante. Sem o segredo configurado: 503 e nada roda; segredo errado: 401. O que faz: api/cron/_limpeza.js.
// O corpo e o log levam só contagens (nada de nome, link ou id).

import { createHash, timingSafeEqual } from 'node:crypto'
import { nuvemLigada } from '../_banco.js'
import { json } from '../_zro.js'
import { limpar } from './_limpeza.js'

const resumo = (v) => createHash('sha256').update(v).digest()

/** null = pode seguir; senão { status, corpo }. */
export function recusaDoCron(req) {
  const segredo = (process.env.CRON_SECRET || '').trim()
  if (!segredo) return { status: 503, corpo: { ok: false, erro: 'sem_config' } }
  const veio = String(req.headers?.authorization || '')
  // os dois resumos têm o mesmo tamanho: a comparação não conta nada do segredo, nem o comprimento
  if (!timingSafeEqual(resumo(veio), resumo(`Bearer ${segredo}`))) return { status: 401, corpo: { ok: false, erro: 'nao_autorizado' } }
  return null
}

export default async function limparAgendado(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false })
  }
  const recusa = recusaDoCron(req)
  if (recusa) return json(res, recusa.status, recusa.corpo)
  if (!nuvemLigada()) return json(res, 503, { ok: false, erro: 'sem_banco' })
  const r = await limpar()
  const { falhas, ...contas } = r
  console.log(`limpar: ${JSON.stringify({ ...contas, falhas: falhas.length })}`)
  return json(res, r.ok ? 200 : 500, r)
}
