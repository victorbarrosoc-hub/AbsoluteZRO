// Rota da pessoa: sessão passada pelo gate (api/_sessao.js), banco ligado, corpo JSON e a função dentro de
// `comoPessoa` (papel foto_app, RLS). Uso: export default rota({ GET: async (tx, pessoa, corpo, req) => ({ status, corpo }) }).
// Sem sessão liberada, 401; sem banco, 503; método fora da lista, 405.
import { comoPessoa, nuvemLigada } from './_banco.js'
import { lerJson, pessoaDe } from './_sessao.js'
import { json, origemDoPedido } from './_zro.js'

const COM_CORPO = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function rota(metodos) {
  return async (req, res) => {
    const fn = metodos[req.method]
    if (!fn) {
      res.setHeader('Allow', Object.keys(metodos).join(', '))
      return json(res, 405, { ok: false })
    }
    const p = pessoaDe(req)
    if (!p) return json(res, 401, { ok: false, erro: 'sem_sessao' })
    let corpo = {}
    if (COM_CORPO.has(req.method)) {
      // só o próprio site escreve por aqui (outra página não usa a sessão de ninguém)
      const origin = req.headers.origin
      if (origin && origin !== origemDoPedido(req)) return json(res, 403, { ok: false, erro: 'origem' })
      try {
        corpo = await lerJson(req)
      } catch {
        return json(res, 400, { ok: false, erro: 'corpo' })
      }
    }
    if (!nuvemLigada()) return json(res, 503, { ok: false, erro: 'sem_banco' })
    const r = await comoPessoa(p, (tx) => fn(tx, p, corpo, req))
    return json(res, r.status, r.corpo)
  }
}
