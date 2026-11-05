// POST /api/radio/aviso { diaria, tipo } — aviso de set para a diária inteira (Silêncio, Ação, Corta, Intervalo). Só
// quem criou a diária ou quem está na Direção (radio.pode_avisar, conferido também pelo RLS). Devolve { aviso: { id } };
// o app repassa na hora pelos canais de dados e os outros aparelhos também pegam pela batida.

import { comoPessoa, nuvemLigada } from '../_banco.js'
import { json } from '../_zro.js'
import { lerJson, pessoaDe } from '../_sessao.js'

export const TIPOS = ['silencio', 'acao', 'corta', 'intervalo']

export default async function aviso(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { ok: false })
  }
  const p = pessoaDe(req)
  if (!p) return json(res, 401, { ok: false, erro: 'sem_sessao' })
  if (!nuvemLigada()) return json(res, 503, { ok: false, erro: 'sem_banco' })
  let c
  try {
    c = await lerJson(req)
  } catch {
    return json(res, 400, { ok: false })
  }
  const diaria = String(c.diaria || '')
  if (!/^[a-z0-9]{12}$/.test(diaria) || !TIPOS.includes(c.tipo)) return json(res, 400, { ok: false })
  const r = await comoPessoa(p, async (tx) => {
    const [pode] = await tx`select radio.pode_avisar(${diaria}) as ok`
    if (!pode?.ok) return null
    const [a] = await tx`insert into radio.avisos (diaria_id, tipo, de_sub, de_nome) values (${diaria}, ${c.tipo}, ${p.sub}, ${p.nome}) returning id`
    return a
  })
  if (!r) return json(res, 403, { ok: false, erro: 'sem_permissao' })
  return json(res, 201, { ok: true, aviso: { id: Number(r.id), tipo: c.tipo, de: p.nome } })
}
