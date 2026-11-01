// Higgsfield no Rift: duas portas, o mesmo pedido ("anime esta imagem").
//
//   chave  a chave da API da pessoa (id:segredo, console.higgsfield.ai). Saldo em dólar da API, separado do plano.
//          https://docs.higgsfield.ai (upload por URL pré-assinada, pedido assíncrono, status por request_id).
//   conta  "Entrar com a Higgsfield": OAuth (código + PKCE) no servidor de login da Higgsfield e as ferramentas do
//          MCP (https://mcp.higgsfield.ai/mcp) com o token da pessoa. Gasta os créditos do plano dela. O Rift se
//          registra como app na primeira vez (registro dinâmico, RFC 7591) e guarda o client_id em rift.apps_oauth.
//
// O arquivo vai do aparelho direto para o armazenamento da Higgsfield (URL pré-assinada, CORS aberto); o resultado
// volta da CDN dela para o aparelho. O servidor só segura as credenciais. Nada aqui inventa estado: o que a tela
// mostra é o que a Higgsfield respondeu.

import { createHash, randomBytes } from 'node:crypto'

export const API = 'https://api.higgsfield.ai'
export const MCP = 'https://mcp.higgsfield.ai/mcp'
export const LOGIN = 'https://clerk.higgsfield.ai'
export const ESCOPOS_HF = 'openid email offline_access'
const ESPERA_MS = 25_000

export class HfErro extends Error {
  constructor(mensagem, status = 502) {
    super(mensagem)
    this.status = status
  }
}
/** A Higgsfield recusou a credencial (chave errada, login vencido ou revogado): a pessoa precisa conectar de novo. */
export class HfSemAcesso extends HfErro {
  constructor() {
    super('A Higgsfield não aceitou a conexão. Conecte de novo.', 401)
  }
}

/** As três opções de gasto em cada porta (imagem → vídeo, sem som: o som do motion vem do NOSSOM). O custo de cada uma
 * vem da Higgsfield na hora (conta: `get_cost`; chave: /estimate), nunca de uma tabela do Rift. "curto" e "longo" viram
 * os segundos que cada modelo aceita. */
export const OPCOES = {
  conta: [
    { id: 'rapido', nome: 'Rápido', desc: 'Prévia ágil para testar a ideia', modelo: 'grok_video_v15_lite', segundos: { curto: 5, longo: 10 }, extra: {} },
    { id: 'equilibrado', nome: 'Equilibrado', desc: 'Movimento de cinema, ótimo custo', modelo: 'kling2_6', segundos: { curto: 5, longo: 10 }, extra: { sound: false } },
    { id: 'maximo', nome: 'Máxima qualidade', desc: 'Mais detalhe, física e acabamento', modelo: 'kling3_0', segundos: { curto: 5, longo: 10 }, extra: { mode: 'pro', sound: 'off' } },
  ],
  chave: [
    { id: 'rapido', nome: 'Rápido', desc: 'Prévia ágil para testar a ideia', modelo: 'hailuo-2.3', caminho: '/minimax/hailuo-2.3/standard/image-to-video', segundos: { curto: 6, longo: 10 } },
    { id: 'equilibrado', nome: 'Equilibrado', desc: 'Movimento de cinema, ótimo custo', modelo: 'kling-2.5-turbo-standard', caminho: '/kling-video/v2.5-turbo/standard/image-to-video', segundos: { curto: 5, longo: 10 } },
    { id: 'maximo', nome: 'Máxima qualidade', desc: 'Mais detalhe, física e acabamento', modelo: 'kling-2.5-turbo-pro', caminho: '/kling-video/v2.5-turbo/pro/image-to-video', segundos: { curto: 5, longo: 10 } },
  ],
}
export const opcaoDe = (tipo, id) => (OPCOES[tipo] || []).find((o) => o.id === id) || null
export const DURACOES = ['curto', 'longo']

/** Prévias em imagem (a "tela" antes do vídeo): o modelo mais barato de cada porta. Conta: GPT Image 2.5 Flare em
 * qualidade baixa, que aceita a imagem da camada como referência; chave: Soul (só texto). */
export const IMAGEM = {
  conta: { modelo: 'gpt_image_2_5', extra: { variant: 'flare', quality: 'low' } },
  chave: { modelo: 'soul-standard', caminho: '/higgsfield-ai/soul/standard' },
}
export const PROPORCOES = ['16:9', '9:16', '1:1', '4:5']
const IMG_URL = /^https:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?$/i
const VID_URL = /^https:\/\/\S+\.(mp4|mov|webm)(\?\S*)?$/i

const ESTADOS = { queued: 'na_fila', in_progress: 'gerando', processing: 'gerando', running: 'gerando', pending: 'na_fila', completed: 'pronto', succeeded: 'pronto', done: 'pronto', failed: 'falhou', error: 'falhou', nsfw: 'recusado', canceled: 'cancelado', cancelled: 'cancelado' }
export const estadoDe = (s) => ESTADOS[String(s || '').toLowerCase()] || null
export const terminal = (e) => ['pronto', 'falhou', 'recusado', 'cancelado'].includes(e)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ───────── chave da API ─────────

/** "id:segredo" (aceita colar com "Key " na frente). Devolve a chave limpa ou null. */
export function chaveLimpa(texto) {
  const t = String(texto || '')
    .trim()
    .replace(/^key\s+/i, '')
  return /^[A-Za-z0-9_.-]{6,200}:[A-Za-z0-9_.\-+/=]{6,400}$/.test(t) ? t : null
}

async function apiPedir(chave, metodo, caminho, corpo, extra = {}) {
  let r
  try {
    r = await fetch(caminho.startsWith('https://') ? caminho : API + caminho, {
      method: metodo,
      headers: { authorization: `Key ${chave}`, ...(corpo ? { 'content-type': 'application/json' } : {}), ...extra },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch {
    throw new HfErro('A Higgsfield não respondeu. Tente de novo.')
  }
  if (r.status === 401 || r.status === 403) throw new HfSemAcesso()
  const texto = await r.text()
  let d = null
  try {
    d = texto ? JSON.parse(texto) : null
  } catch {}
  return { status: r.status, d }
}

/** Confere a chave sem gastar nada: pergunta por um pedido que não existe (404 = chave aceita; 401/403 = recusada). */
export async function testarChave(chave) {
  try {
    const { status } = await apiPedir(chave, 'GET', '/requests/00000000-0000-4000-8000-000000000000/status')
    return status < 500
  } catch (e) {
    if (e instanceof HfSemAcesso) return false
    throw e
  }
}

export async function chavePreparar(chave, conteudo) {
  const { status, d } = await apiPedir(chave, 'POST', '/files/generate-upload-url', { content_type: conteudo })
  if (status >= 300 || !d?.upload_url || !d?.public_url) throw new HfErro(d?.detail || 'A Higgsfield não abriu o envio do arquivo.')
  return { upload_url: d.upload_url, headers: d.upload_headers || { 'Content-Type': conteudo }, ref: d.public_url }
}

/** Quanto a Higgsfield cobra (USD) por esta opção, sem gerar. null se ela não informar. */
export async function chaveCusto(chave, op, segundos) {
  try {
    const { status, d } = await apiPedir(chave, 'POST', `/estimate${op.caminho}`, { prompt: 'estimate', image_url: 'https://d8j0ntlcm91z4.cloudfront.net/estimate.jpg', duration: segundos })
    const usd = Number(d?.usd)
    return status < 300 && Number.isFinite(usd) ? usd : null
  } catch (e) {
    if (e instanceof HfSemAcesso) throw e
    return null
  }
}

export async function chaveIniciar(chave, { op, prompt, duracao, ref, idem }) {
  const { status, d } = await apiPedir(chave, 'POST', op.caminho, { prompt, image_url: ref, duration: duracao }, { 'idempotency-key': idem })
  if (status >= 300 || !d?.request_id) throw new HfErro(d?.detail || 'A Higgsfield recusou o pedido.', status >= 400 && status < 500 ? 400 : 502)
  return { pedido: d.request_id, estado: estadoDe(d.status) || 'na_fila' }
}

export async function chaveStatus(chave, pedido) {
  const { status, d } = await apiPedir(chave, 'GET', `/requests/${encodeURIComponent(pedido)}/status`)
  if (status >= 300 || !d) throw new HfErro('Não deu para ver o andamento agora.')
  const urls = Array.isArray(d.images) ? d.images.map((i) => i?.url).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4) : []
  return { estado: estadoDe(d.status) || 'gerando', url: d.video?.url || null, urls, erro: d.error || null }
}

export async function chaveCustoImagens(chave, quantidade, proporcao) {
  try {
    const { status, d } = await apiPedir(chave, 'POST', `/estimate${IMAGEM.chave.caminho}`, { prompt: 'estimate', num_images: quantidade, aspect_ratio: proporcao, resolution: '2K' })
    const usd = Number(d?.usd)
    return status < 300 && Number.isFinite(usd) ? usd : null
  } catch (e) {
    if (e instanceof HfSemAcesso) throw e
    return null
  }
}

export async function chaveIniciarImagens(chave, { prompt, quantidade, proporcao, idem }) {
  const { status, d } = await apiPedir(chave, 'POST', IMAGEM.chave.caminho, { prompt, num_images: quantidade, aspect_ratio: proporcao, resolution: '2K' }, { 'idempotency-key': idem })
  if (status >= 300 || !d?.request_id) throw new HfErro(d?.detail || 'A Higgsfield recusou o pedido.', status >= 400 && status < 500 ? 400 : 502)
  return { pedido: d.request_id, estado: estadoDe(d.status) || 'na_fila' }
}

// ───────── conta (OAuth + MCP) ─────────

export const novoSegredo = () => randomBytes(32).toString('base64url')
export const desafio = (v) => createHash('sha256').update(v).digest('base64url')

/** O registro do Rift como app na Higgsfield (uma vez por endereço de volta). `sql` precisa ser o papel dono. */
export async function appDaHiggsfield(sql, redirect) {
  const [r] = await sql`select client_id from rift.apps_oauth where servico = 'higgsfield' and redirect = ${redirect}`
  if (r) return r.client_id
  let resp
  try {
    resp = await fetch(`${LOGIN}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Rift Motion (Absolute ZRO)', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: ESCOPOS_HF }),
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch {
    throw new HfErro('A Higgsfield não respondeu. Tente de novo.')
  }
  const d = await resp.json().catch(() => null)
  if (!resp.ok || typeof d?.client_id !== 'string') throw new HfErro('A Higgsfield não aceitou o registro do Rift.')
  await sql`insert into rift.apps_oauth (servico, client_id, redirect) values ('higgsfield', ${d.client_id}, ${redirect}) on conflict (servico) do update set client_id = excluded.client_id, redirect = excluded.redirect`
  return d.client_id
}

export function urlEntrarHf({ clientId, redirect, state, verificador }) {
  const u = new URL(`${LOGIN}/oauth/authorize`)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirect)
  u.searchParams.set('scope', ESCOPOS_HF)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', desafio(verificador))
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('resource', MCP)
  return u.toString()
}

async function token(corpo) {
  let r
  try {
    r = await fetch(`${LOGIN}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(corpo).toString(), signal: AbortSignal.timeout(ESPERA_MS) })
  } catch {
    throw new HfErro('A Higgsfield não respondeu. Tente de novo.')
  }
  const d = await r.json().catch(() => null)
  if (r.status === 400 || r.status === 401) throw new HfSemAcesso()
  if (!r.ok || typeof d?.access_token !== 'string') throw new HfErro('A Higgsfield não entregou o acesso.')
  return { access: d.access_token, refresh: d.refresh_token || corpo.refresh_token || null, expira: Math.floor(Date.now() / 1000) + (Number(d.expires_in) || 3600), idToken: d.id_token || null }
}

export const trocarCodigoHf = ({ clientId, code, redirect, verificador }) => token({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: clientId, code_verifier: verificador, resource: MCP })
export const renovarHf = ({ clientId, refresh }) => token({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId, resource: MCP })

/** E-mail do id_token só como rótulo na tela ("conectado como …"). Não é usado para decidir nada. */
export function emailDoIdToken(idToken) {
  try {
    const d = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'))
    return typeof d.email === 'string' ? d.email.slice(0, 120) : null
  } catch {
    return null
  }
}

let rpcId = 0
async function rpc(access, sessao, corpo) {
  let r
  try {
    r = await fetch(MCP, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...(sessao ? { 'mcp-session-id': sessao } : {}) },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch {
    throw new HfErro('A Higgsfield não respondeu. Tente de novo.')
  }
  if (r.status === 401 || r.status === 403) throw new HfSemAcesso()
  const sid = r.headers.get('mcp-session-id') || sessao
  if (r.status === 202 || corpo.id === undefined) return { sid, msg: null }
  const texto = await r.text()
  if (!r.ok) throw new HfErro('A Higgsfield recusou o pedido.')
  let msg = null
  if (/text\/event-stream/i.test(r.headers.get('content-type') || '')) {
    for (const linha of texto.split(/\r?\n/)) {
      if (!linha.startsWith('data:')) continue
      try {
        const d = JSON.parse(linha.slice(5).trim())
        if (d && d.id === corpo.id) msg = d
      } catch {}
    }
  } else {
    try {
      msg = JSON.parse(texto)
    } catch {}
  }
  if (!msg) throw new HfErro('Resposta da Higgsfield fora do formato.')
  return { sid, msg }
}

/** Abre uma sessão no MCP da Higgsfield com o token da pessoa (várias ferramentas na mesma sessão). */
export async function mcpAbrir(access) {
  const ini = await rpc(access, null, { jsonrpc: '2.0', id: ++rpcId, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'rift-motion', version: '1.0.0' } } })
  if (ini.msg?.error) throw new HfErro('A Higgsfield recusou a conexão.')
  await rpc(access, ini.sid, { jsonrpc: '2.0', method: 'notifications/initialized' })
  return { access, sid: ini.sid }
}

/** Chama uma ferramenta do MCP da Higgsfield. Devolve o JSON do resultado. */
export const mcpFerramenta = async (access, nome, args) => mcpChamar(await mcpAbrir(access), nome, args)

export async function mcpChamar(sessao, nome, args) {
  const { msg } = await rpc(sessao.access, sessao.sid, { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: nome, arguments: args } })
  if (msg.error) throw new HfErro(String(msg.error.message || 'A Higgsfield recusou o pedido.').slice(0, 300))
  const res = msg.result || {}
  const texto = (res.content || [])
    .filter((c) => c && c.type === 'text')
    .map((c) => c.text)
    .join('\n')
  if (res.isError) throw new HfErro(texto.slice(0, 300) || 'A Higgsfield recusou o pedido.', 400)
  if (res.structuredContent && typeof res.structuredContent === 'object') return res.structuredContent
  try {
    return JSON.parse(texto)
  } catch {
    const m = texto.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {}
    }
    return { texto }
  }
}

/** Procura no JSON (qualquer profundidade) o primeiro valor que passa no teste. */
export function achar(obj, teste, prof = 0) {
  if (obj == null || prof > 8) return undefined
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const a = achar(v, teste, prof + 1)
      if (a !== undefined) return a
    }
    return undefined
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) if (teste(k, v)) return v
    for (const v of Object.values(obj)) {
      const a = achar(v, teste, prof + 1)
      if (a !== undefined) return a
    }
  }
  return undefined
}

/** Todos os valores (qualquer profundidade) que passam no teste, na ordem em que aparecem, sem repetir. */
export function todos(obj, teste, prof = 0, saida = []) {
  if (obj == null || prof > 8) return saida
  if (Array.isArray(obj)) obj.forEach((v) => todos(v, teste, prof + 1, saida))
  else if (typeof obj === 'object')
    for (const [k, v] of Object.entries(obj)) {
      if (teste(k, v) && !saida.includes(v)) saida.push(v)
      else todos(v, teste, prof + 1, saida)
    }
  return saida
}

export async function contaPreparar(access, conteudo) {
  const ext = { 'image/png': 'png', 'image/webp': 'webp' }[conteudo] || 'jpg'
  const d = await mcpFerramenta(access, 'media_upload', { filename: `rift.${ext}`, content_type: conteudo })
  const up = Array.isArray(d.uploads) ? d.uploads[0] : d
  if (!up?.upload_url || !UUID.test(String(up.media_id || ''))) throw new HfErro('A Higgsfield não abriu o envio do arquivo.')
  return { upload_url: up.upload_url, headers: { 'Content-Type': up.content_type || conteudo }, ref: up.media_id }
}

/** Confirma o envio (uma segunda confirmação do mesmo arquivo não impede gerar). */
async function confirmar(sessao, ref) {
  try {
    await mcpChamar(sessao, 'media_confirm', { type: 'image', media_id: ref })
  } catch (e) {
    if (e instanceof HfSemAcesso) throw e
  }
}

const paramsImagem = (prompt, quantidade, proporcao, ref) => ({ model: IMAGEM.conta.modelo, prompt, count: quantidade, aspect_ratio: proporcao, use_unlim: false, ...(ref ? { medias: [{ role: 'image_references', value: ref }] } : {}), ...IMAGEM.conta.extra })

export async function contaCustoImagens(sessao, quantidade, proporcao) {
  const d = await mcpChamar(sessao, 'generate_image', { context: 'Rift Motion: preço das prévias.', params: { ...paramsImagem('estimate', quantidade, proporcao), get_cost: true } })
  const c = Number(d.cost?.credits_exact ?? d.cost?.credits)
  return Number.isFinite(c) ? c : null
}

/** Pede as prévias. Devolve os ids dos jobs (um por imagem ou um para todas, como a Higgsfield responder). */
export async function contaIniciarImagens(access, { prompt, quantidade, proporcao, ref }) {
  const sessao = await mcpAbrir(access)
  if (ref) await confirmar(sessao, ref)
  const d = await mcpChamar(sessao, 'generate_image', { context: 'Rift Motion: prévia da tela antes de animar.', params: paramsImagem(prompt, quantidade, proporcao, ref) })
  let jobs = todos(d, (k, v) => /^job_?id$/i.test(k) && typeof v === 'string' && UUID.test(v) && v !== ref)
  if (!jobs.length) jobs = todos(d.jobs || d.job || d, (k, v) => /^id$/i.test(k) && typeof v === 'string' && UUID.test(v) && v !== ref)
  if (!jobs.length) throw new HfErro(String(achar(d, (k, v) => /^(message|error|detail|texto)$/i.test(k) && typeof v === 'string') || 'A Higgsfield não confirmou o pedido.').slice(0, 300))
  return { pedido: jobs.slice(0, 4).join(','), estado: 'na_fila' }
}

export async function contaStatusImagens(access, pedido) {
  const ids = String(pedido).split(',').filter((x) => UUID.test(x))
  const d = await mcpFerramenta(access, 'jobs_wait', { jobs: ids.map((job_id, index) => ({ index, job_id })), timeout_seconds: 0 })
  const estados = todos(d, (k, v) => /^status$/i.test(k) && typeof v === 'string').map(estadoDe).filter(Boolean)
  let urls = todos(d, (k, v) => /^raw_?url$/i.test(k) && typeof v === 'string' && IMG_URL.test(v))
  if (!urls.length) urls = todos(d, (k, v) => typeof v === 'string' && IMG_URL.test(v))
  const aberto = estados.some((e) => !terminal(e))
  const estado = aberto ? 'gerando' : urls.length ? 'pronto' : estados.find((e) => e !== 'pronto') || (estados.length ? 'falhou' : 'gerando')
  const erro = terminal(estado) && estado !== 'pronto' ? String(achar(d, (k, v) => /^(error|message|detail|reason)$/i.test(k) && typeof v === 'string') || '').slice(0, 300) || null : null
  return { estado, urls: estado === 'pronto' ? urls.slice(0, 4) : [], erro }
}

/** Saldo da conta: { creditos, plano }. */
export async function contaSaldo(sessao) {
  const d = await mcpChamar(sessao, 'balance', {})
  const creditos = Number(d.credits ?? achar(d, (k, v) => /^credits$/i.test(k) && typeof v === 'number'))
  return { creditos: Number.isFinite(creditos) ? creditos : null, plano: typeof d.subscription_plan_type === 'string' ? d.subscription_plan_type : null }
}

/** Créditos gastos na Higgsfield desde `desde` (gastos menos devoluções), lendo o extrato (até 500 lançamentos). */
export async function contaUsoDesde(sessao, desde) {
  let usado = 0
  let cursor
  for (let pagina = 0; pagina < 5; pagina++) {
    const d = await mcpChamar(sessao, 'transactions', { size: 100, ...(cursor != null ? { cursor } : {}) })
    const itens = Array.isArray(d.items) ? d.items : []
    let antigo = false
    for (const t of itens) {
      if (new Date(t.created_at) < desde) {
        antigo = true
        break
      }
      const c = Number(t.credits)
      if (Number.isFinite(c) && ['spend', 'deduct', 'refund'].includes(t.action)) usado -= c
    }
    if (antigo || d.next_cursor == null || !itens.length) break
    cursor = d.next_cursor
  }
  return Math.max(0, Math.round(usado * 100) / 100)
}

const paramsConta = (op, segundos, prompt, ref) => ({ model: op.modelo, prompt, duration: segundos, count: 1, use_unlim: false, ...(ref ? { medias: [{ role: 'start_image', value: ref }] } : {}), ...op.extra })

/** Quantos créditos a Higgsfield cobra por esta opção, sem gerar. */
export async function contaCusto(sessao, op, segundos) {
  const d = await mcpChamar(sessao, 'generate_video', { context: 'Rift Motion: preço antes de gerar.', params: { ...paramsConta(op, segundos, 'estimate'), get_cost: true } })
  const c = Number(d.cost?.credits_exact ?? d.cost?.credits)
  return Number.isFinite(c) ? c : null
}

export async function contaIniciar(access, { op, prompt, duracao, ref }) {
  const sessao = await mcpAbrir(access)
  await confirmar(sessao, ref)
  const d = await mcpChamar(sessao, 'generate_video', { context: 'Rift Motion: animar uma imagem da cena do motion.', params: paramsConta(op, duracao, prompt, ref) })
  const ehJob = (re) => (k, v) => re.test(k) && typeof v === 'string' && UUID.test(v) && v !== ref
  const job = achar(d, ehJob(/^job_?id$/i)) || achar(d.jobs || d.job || d, ehJob(/^id$/i))
  if (!job) throw new HfErro(String(achar(d, (k, v) => /^(message|error|detail|texto)$/i.test(k) && typeof v === 'string') || 'A Higgsfield não confirmou o pedido.').slice(0, 300))
  return { pedido: job, estado: 'na_fila' }
}

export async function contaStatus(access, pedido) {
  const d = await mcpFerramenta(access, 'jobs_wait', { jobs: [{ index: 0, job_id: pedido }], timeout_seconds: 0 })
  const bruto = achar(d, (k, v) => /^status$/i.test(k) && typeof v === 'string')
  const url = achar(d, (k, v) => typeof v === 'string' && VID_URL.test(v))
  const estado = estadoDe(bruto) || (url ? 'pronto' : 'gerando')
  const erro = terminal(estado) && estado !== 'pronto' ? String(achar(d, (k, v) => /^(error|message|detail|reason)$/i.test(k) && typeof v === 'string') || '').slice(0, 300) || null : null
  return { estado, url: estado === 'pronto' ? url || null : null, erro }
}
