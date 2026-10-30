// O Set (o <zro-set> de absolutezro.com e o repasse /api/zro/set) simulado no Playwright: o componente vem da cópia do
// repositório (apps/hub-web/public/set/v1), com os cabeçalhos de produção (CORS e CORP, que o COEP require-corp exige),
// e /api/zro/set/* responde como o repasse, com pessoas fictícias. `logado: false` é o 401 (login de antes do Set);
// `desligado: true` serve um módulo vazio (o widget nunca chega: nada de rede nem de erro no console).
// Este arquivo é o mesmo no AEON e na Revela.
import { readFileSync } from 'node:fs'

const SET = new URL('../../../apps/hub-web/public/set/v1/zro-set.js', import.meta.url)
const DE_FORA = { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'cache-control': 'no-store' }
const P = (n) => `00000000-0000-4000-8000-00000000000${n}`
const EU = { id: P(1), arroba: 'lia', nome: 'Lia Produtora', foto: null, preferencias: { invisivel: false, quemVe: 'equipe_contatos', mostrarVisto: true } }
const PESSOAS = [
  { id: P(2), arroba: 'rui', nome: 'Rui Tavares', foto: null, estado: 'online', app: { id: 'maestro', nome: 'Maestro' } },
  { id: P(3), arroba: 'bia', nome: 'Bia Lemos', foto: null, estado: 'ausente', app: { id: 'hub', nome: 'Absolute ZRO' } },
]

export async function simularSet(pagina, { logado = true, desligado = false } = {}) {
  const pedidos = []
  await pagina.route('https://absolutezro.com/set/**', (r) => r.fulfill({ status: 200, headers: { ...DE_FORA, 'content-type': 'text/javascript; charset=utf-8' }, body: desligado ? 'export {}\n' : readFileSync(SET) }))
  await pagina.route(/\/api\/zro\/set(\/|\?|$)/, async (r) => {
    const req = r.request()
    const caminho = new URL(req.url()).pathname.replace(/^\/api\/zro\/set/, '')
    pedidos.push({ metodo: req.method(), caminho, autorizacao: (await req.allHeaders()).authorization || null })
    const json = (status, corpo) => r.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(corpo) })
    if (!logado) return json(401, { ok: false, message: 'Entre com a conta Absolute ZRO para ver o Set.' })
    if (caminho === '' || caminho === '/') return json(200, { eu: EU, pessoas: PESSOAS, naoLidas: 2, pedidos: 0, porConversa: {}, ultima: 0 })
    if (caminho === '/conversas') return json(200, { conversas: [], projetos: [] })
    if (caminho === '/contatos') return json(200, { contatos: [], recebidos: [], enviados: [], bloqueados: [] })
    return json(200, { ok: true })
  })
  return pedidos
}
