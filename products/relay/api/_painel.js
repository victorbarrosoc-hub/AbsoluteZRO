// Código comum de /api/relay/painel (a Vercel não transforma em função os arquivos de api/ que começam com "_"):
// quem é a pessoa (só da sessão rl_conta, nunca do pedido), o corpo do pedido e a conferência do que chega. O cliente
// manda o mesmo formato que guarda no aparelho (src/painel.js `registro` e `projeto`; a ficha de src/personalizado.js).

import { abrir, COOKIE_CONTA, lerCookie, origemDoPedido } from './_zro.js'
import { presetPersonalizado, especificacaoDe } from '../src/personalizado.js'
import { DESTINOS_MAX, HISTORICO_MAX, NOME_MAX } from '../src/painel.js'

export const LOTE_MAX = 100
const CORPO_MAX = 256 * 1024
const ID_CONVERSAO = /^cv-[a-z0-9-]{4,60}$/
const ID_PROJETO = /^pj-[a-z0-9-]{4,60}$/
const ID_PRESET = /^meu-[a-z0-9-]{4,40}$/
const ID_DESTINO = /^[a-z0-9-]{2,60}$/

/** { sub, org } da sessão do Relay, ou null. A organização é a ativa no login (zro_org). */
export function pessoaDe(req) {
  const c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (!c || typeof c.sub !== 'string' || !c.sub) return null
  const org = c.org && typeof c.org.id === 'string' && c.org.id ? c.org.id.slice(0, 100) : null
  return { sub: c.sub, org }
}

/** Escrita só do próprio site (outra página não mexe no painel de ninguém). */
export const mesmaOrigem = (req) => !req.headers.origin || req.headers.origin === origemDoPedido(req)

/** Corpo JSON (a Vercel já entrega em req.body; no teste, lê o fluxo). Até 256 KB. */
export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body)
  let tam = 0
  const partes = []
  for await (const p of req) {
    tam += p.length
    if (tam > CORPO_MAX) throw Object.assign(new Error('grande demais'), { status: 413 })
    partes.push(p)
  }
  return partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}
}

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const num = (v, max = 1e15) => (Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0)

/** Uma conversão como o cliente guarda → linha do banco (ou null se não valer). */
export function conversaoDoPedido(x) {
  if (!x || typeof x !== 'object' || !ID_CONVERSAO.test(String(x.id))) return null
  const quando = Number(x.quando)
  if (!Number.isFinite(quando) || quando < 1.6e12 || quando > Date.now() + 864e5) return null
  const e = x.entrada ?? {}
  const p = x.preset ?? {}
  const s = x.saida ?? {}
  const presetId = texto(p.id, 80)
  if (!ID_DESTINO.test(presetId)) return null
  return {
    id: x.id,
    quando: new Date(quando),
    projeto_id: typeof x.projeto === 'string' && ID_PROJETO.test(x.projeto) ? x.projeto : null,
    origem: ['navegador', 'computador', 'sobedesce'].includes(x.origem) ? x.origem : 'navegador',
    entrada: { nome: texto(e.nome, 200), bytes: num(e.bytes), duracao: num(e.duracao, 1e7), video: Boolean(e.video) },
    preset: { id: presetId, nome: texto(p.nome, NOME_MAX), icone: texto(p.icone, 30) || 'seta', meu: Boolean(p.meu) },
    saida: { nome: texto(s.nome, 200), bytes: num(s.bytes), largura: num(s.largura, 1e5), altura: num(s.altura, 1e5), codec: texto(s.codec, 20), pasta: Boolean(s.pasta) },
    segundos: num(x.segundos, 1e7),
  }
}

/** Linha do banco → o formato do aparelho. */
export const conversaoDaLinha = (r) => ({ id: r.id, quando: new Date(r.quando).getTime(), projeto: r.projeto_id, origem: r.origem, entrada: r.entrada, preset: r.preset, saida: r.saida, segundos: r.segundos })

/** Projeto do pedido (dono e organização vêm da sessão). Erro com mensagem em português. */
export function projetoDoPedido(x, pessoa) {
  if (!x || typeof x !== 'object' || !ID_PROJETO.test(String(x.id))) throw Object.assign(new Error('Projeto sem id.'), { status: 400 })
  const nome = texto(x.nome, NOME_MAX)
  if (!nome) throw Object.assign(new Error('Dê um nome ao projeto.'), { status: 400 })
  const destinos = [...new Set((Array.isArray(x.destinos) ? x.destinos : []).filter((d) => typeof d === 'string' && ID_DESTINO.test(d)))].slice(0, DESTINOS_MAX)
  const equipe = Boolean(x.equipe) && Boolean(pessoa.org)
  return { id: x.id, nome, destinos, equipe, org_id: pessoa.org }
}

export const projetoDaLinha = (r, sub) => ({ id: r.id, nome: r.nome, destinos: r.destinos, equipe: r.equipe, meu: r.user_sub === sub, criado: new Date(r.criado).getTime(), atualizado: new Date(r.atualizado).getTime() })

/** Preset do pedido: a ficha passa pela mesma validação do conversor (src/personalizado.js). */
export function presetDoPedido(x, pessoa) {
  if (!x || typeof x !== 'object' || !ID_PRESET.test(String(x.id))) throw Object.assign(new Error('Preset sem id.'), { status: 400 })
  let p
  try {
    p = presetPersonalizado(x.ficha, x.id)
  } catch (e) {
    throw Object.assign(new Error(e.message), { status: 400 })
  }
  return { id: x.id, ficha: especificacaoDe(p), equipe: Boolean(x.equipe) && Boolean(pessoa.org), org_id: pessoa.org }
}

export const presetDaLinha = (r, sub) => ({ id: r.id, ficha: r.ficha, equipe: r.equipe, meu: r.user_sub === sub, atualizado: new Date(r.atualizado).getTime() })

export { HISTORICO_MAX }
