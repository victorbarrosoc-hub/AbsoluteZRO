// A Z (o <zro-ia> de absolutezro.com e a API dela) simulada no Playwright: o componente e as imagens vêm da cópia do
// repositório (apps/hub-web/public/ia), com os cabeçalhos de produção (CORS e CORP, que o COEP require-corp exige), e
// /api/zro/ia/* responde como o repasse, sem rede e sem conta de verdade. `logado: false` é o 401 (login antigo sem o
// escopo zro.ia, ou o acesso caiu). Este arquivo é o mesmo no AEON e na Revela.
import { readFileSync } from 'node:fs'

const IA = new URL('../../../apps/hub-web/public/ia/', import.meta.url)
const DE_FORA = { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'cache-control': 'no-store' }

export async function simularZ(pagina, { logado = true, nome = 'Lia', resposta = ['Oi, Lia. ', 'Aqui é a Z: ', 'posso te ajudar com isso.'] } = {}) {
  const pedidos = []
  await pagina.route('https://absolutezro.com/ia/**', (r) => {
    const p = new URL(r.request().url()).pathname.replace(/^\/ia\//, '')
    const tipo = p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'image/webp'
    return r.fulfill({ status: 200, headers: { ...DE_FORA, 'content-type': tipo }, body: readFileSync(new URL(p, IA)) })
  })
  await pagina.route('**/api/zro/ia/**', async (r) => {
    const req = r.request()
    const caminho = new URL(req.url()).pathname.replace(/^\/api\/zro\/ia/, '')
    pedidos.push({ metodo: req.method(), caminho, corpo: req.postData(), autorizacao: (await req.allHeaders()).authorization || null })
    const json = (status, corpo) => r.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(corpo) })
    if (!logado) return json(401, { ok: false, message: 'Entre de novo para conversar com a Z.' })
    if (caminho === '/estado') return json(200, { ligada: true, nome, produto: null, creditos: { usados: 12, limite: 100, renova_em: '2026-11-27T12:00:00.000Z' } })
    if (caminho === '/conversas') return json(200, { conversas: [] })
    if (caminho === '/mensagens') {
      const linhas = [{ tipo: 'conversa', id: 'c-1' }, ...resposta.map((t) => ({ tipo: 'texto', t })), { tipo: 'fim', creditos: 1 }]
      return r.fulfill({ status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: linhas.map((l) => JSON.stringify(l)).join('\n') + '\n' })
    }
    return json(404, { ok: false })
  })
  return pedidos
}
