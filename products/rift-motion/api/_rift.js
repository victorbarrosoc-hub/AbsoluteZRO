// Rotas de dados do Rift (api/rift/*): quem é a pessoa vem só da sessão assinada (rf_conta, api/_zro.js), nunca do
// pedido; toda leitura e escrita roda em `comoPessoa` (papel rift_app, RLS). Escrita só do próprio site (Origin) e só
// JSON. Sem login configurado ou sem banco (RIFT_DATABASE_URL), responde 503 e o painel segue no aparelho.
import { abrir, configurado, consulta, COOKIE_CONTA, json, lerCookie, origemDoPedido } from './_zro.js'
import { comoPessoa, nuvemLigada } from './_banco.js'

/** Pedido recusado com motivo curto para a tela. */
export class Recusa extends Error {
  constructor(status, mensagem) {
    super(mensagem)
    this.status = status
  }
}

export function pessoaDe(req) {
  const c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (!c || typeof c.sub !== 'string' || !c.sub) return null
  const org = c.org && typeof c.org === 'object' && typeof c.org.id === 'string' && c.org.id ? c.org.id : null
  return { sub: c.sub, org }
}

const LIMITE = 300_000
async function lerCorpo(req) {
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) throw new Recusa(415, 'Mande JSON.')
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  let texto = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  if (!texto) {
    const partes = []
    let n = 0
    for await (const c of req) {
      n += c.length
      if (n > LIMITE) throw new Recusa(413, 'Pedido grande demais.')
      partes.push(c)
    }
    texto = Buffer.concat(partes).toString('utf8')
  }
  if (texto.length > LIMITE) throw new Recusa(413, 'Pedido grande demais.')
  try {
    const d = JSON.parse(texto || '{}')
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error()
    return d
  } catch {
    throw new Recusa(400, 'JSON inválido.')
  }
}

/** Uma rota por método: `fn(tx, { corpo, q, pessoa })` devolve o corpo da resposta (200). */
export function rota(metodos) {
  return async (req, res) => {
    const fn = metodos[req.method]
    if (!fn) {
      res.setHeader('Allow', Object.keys(metodos).join(', '))
      return json(res, 405, { ok: false })
    }
    if (!configurado()) return json(res, 503, { ok: false, motivo: 'login' })
    if (!nuvemLigada()) return json(res, 503, { ok: false, nuvem: false })
    const pessoa = pessoaDe(req)
    if (!pessoa) return json(res, 401, { ok: false })
    if (req.method !== 'GET' && req.headers.origin !== origemDoPedido(req)) return json(res, 403, { ok: false })
    try {
      const corpo = req.method === 'POST' || req.method === 'PATCH' ? await lerCorpo(req) : null
      const q = consulta(req)
      return json(res, 200, { ok: true, ...(await comoPessoa(pessoa, (tx) => fn(tx, { corpo, q, pessoa }))) })
    } catch (e) {
      if (e instanceof Recusa) return json(res, e.status, { ok: false, erro: e.message })
      if (e && e.code === '23505') return json(res, 409, { ok: false, erro: 'Já existe.' })
      if (e && (e.code === '23514' || e.code === '22P02' || e.code === '22003')) return json(res, 400, { ok: false, erro: 'Dados fora do formato.' })
      console.error('rift api', e?.code || '', e?.message || e)
      return json(res, 500, { ok: false, erro: 'Não deu agora. Tente de novo.' })
    }
  }
}

// ───────── validação ─────────
export const CADENCIAS = ['12', '15', '23.976', '24', '29.97', '30', '60', '120']
export const FORMATOS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '4K': [3840, 2160] }
export const TIPOS = ['Vídeo', 'Imagem', 'Áudio', 'Modelo 3D', 'Lottie', 'Arquivo']

export const id = (v) => {
  if (typeof v !== 'string' || !/^[a-z0-9]{6,24}$/.test(v)) throw new Recusa(400, 'Identificador inválido.')
  return v
}
export const texto = (v, max, nome = 'Texto') => {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t || t.length > max) throw new Recusa(400, `${nome} precisa ter de 1 a ${max} caracteres.`)
  return t
}
export const umDe = (v, lista, nome) => {
  if (!lista.includes(v)) throw new Recusa(400, `${nome} fora da lista.`)
  return v
}
export const data = (v) => (Number.isFinite(v) && v > 1.5e12 && v < Date.now() + 864e5 ? new Date(v) : new Date())
const ms = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime())

/** Linha do banco → o projeto do painel. */
export const projetoDe = (r) => ({
  id: r.id,
  nome: r.nome,
  formato: r.formato,
  largura: r.largura,
  altura: r.altura,
  cadencia: r.cadencia,
  duracao: Number(r.duracao),
  modelo: r.modelo,
  tom: r.tom,
  exemplo: r.exemplo,
  criado: ms(r.criado),
  editado: ms(r.editado),
})
export const itemDe = (r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, ext: r.ext, tamanho: Number(r.tamanho), quando: ms(r.criado) })
export const exportacaoDe = (r) => ({ id: r.id, projeto: r.projeto_nome, projetoId: r.projeto_id, formato: r.formato, fps: r.cadencia, tamanho: r.tamanho, destino: r.destino, estado: r.estado, quando: ms(r.criado) })
