// GET /api/camzro/hora — a hora do servidor, para o relógio do set (nucleo/relogio.js): todos os aparelhos acertam o
// timecode pela mesma fonte. Só para quem passou pelo gate; nada além do número.
import { json } from '../_zro.js'
import { pessoaDe } from '../_sessao.js'

export default function hora(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false })
  if (!pessoaDe(req)) return json(res, 401, { ok: false })
  return json(res, 200, { ok: true, agora: Date.now() })
}
