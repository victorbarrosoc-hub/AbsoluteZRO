// GET /api/radio/ice — servidores de conexão (STUN e, com a chave da Cloudflare, TURN) para o aparelho. Regras em
// api/_nucleo.js (pedirIceServers). Só para a sessão que passa no gate.
import { pedirIceServers } from '../_nucleo.js'
import { json } from '../_zro.js'
import { pessoaDe } from '../_sessao.js'

export default async function ice(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false })
  }
  if (!pessoaDe(req)) return json(res, 401, { ok: false, erro: 'sem_sessao' })
  return json(res, 200, { ok: true, ...(await pedirIceServers(process.env)) })
}
