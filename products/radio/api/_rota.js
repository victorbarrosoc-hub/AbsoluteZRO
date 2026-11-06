// Rota do app separado (radio.absolutezro.com e o modo local): pessoa da sessão (gate), banco ligado, corpo JSON e o
// núcleo (api/_nucleo.js) dentro de `comoPessoa` (papel radio_app, RLS).
import { comoPessoa, nuvemLigada } from './_banco.js'
import { json } from './_zro.js'
import { lerJson, pessoaDe } from './_sessao.js'

export function rota(metodos) {
  return async (req, res) => {
    const fn = metodos[req.method]
    if (!fn) {
      res.setHeader('Allow', Object.keys(metodos).join(', '))
      return json(res, 405, { ok: false })
    }
    const p = pessoaDe(req)
    if (!p) return json(res, 401, { ok: false, erro: 'sem_sessao' })
    if (!nuvemLigada()) return json(res, 503, { ok: false, erro: 'sem_banco' })
    let corpo = {}
    if (req.method === 'POST') {
      try {
        corpo = await lerJson(req)
      } catch {
        return json(res, 400, { ok: false, erro: 'corpo' })
      }
    }
    const r = await comoPessoa(p, (tx) => fn(tx, p, corpo))
    return json(res, r.status, r.corpo)
  }
}
