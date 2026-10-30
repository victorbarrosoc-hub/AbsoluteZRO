// Conta Absolute ZRO no app de desktop do Synquei: a mesma tela de conta do site (app/js/conta.js), com o login de app
// nativo do OpenID Connect (RFC 8252). O navegador da pessoa abre a Absolute ZRO, ela entra (ou já está logada) e a
// Absolute ZRO volta para http://127.0.0.1:<porta>/callback, onde este processo ouve só durante o login. Código + PKCE
// S256, state e nonce; o id_token é conferido pela chave pública (JWKS) da Absolute ZRO. Cliente "synquei-desktop"
// (público: sem segredo no app, que é aberto). Porta do AEON (products/ai-edit/desktop/conta.cjs).
//
// Perfil único (docs/integration-contracts/perfil-unico.md): nome, e-mail e foto são da conta Absolute ZRO. A cada
// leitura da conta (`atualizar`) o app relê o perfil no /oauth/userinfo (no máximo 3 s), renovando o access token pelo
// refresh token, e regrava a cópia, junto com zro_products (se o Synquei está liberado). O refresh token só vai para o
// disco cifrado pelo cofre do sistema (Keychain no Mac, DPAPI no Windows: `cofre`, de safeStorage em desktop/main.cjs).
// Sem cofre, fica só na memória enquanto o app está aberto. O access token nunca vai para o disco.
//
// As rotas são as mesmas do site: o protocolo do app responde /api/zro/eu, /api/zro/entrar e /api/zro/sair daqui
// (desktop/main.cjs), no mesmo formato de products/synquei/api/zro/*.

const { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } = require('node:crypto')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const EMISSOR = (process.env.ZRO_ISSUER || 'https://absolutezro.com').replace(/\/+$/, '')
const CLIENTE = 'synquei-desktop'
const PRODUTO = 'synquei'
// zro.ia: a Z (a IA do ecossistema) no painel inicial, pelo repasse /api/zro/ia (o token fica neste processo)
// zro.set: o Set (presença e conversas), pelo repasse /api/zro/set. A Absolute ZRO de antes do Set recusa o escopo
// (invalid_scope): o login refaz o pedido sem ele, uma vez, e segue sem o Set.
const ESCOPOS = 'openid email profile org offline_access zro.ia zro.set'
const ESCOPOS_SEM_SET = 'openid email profile org offline_access zro.ia'
const CONTA_S = 30 * 24 * 3600
const ESPERA_MS = 10 * 60 * 1000
// reler o perfil não pode prender a abertura do app: sem resposta nesse prazo, vale a cópia
const PERFIL_MS = 3_000

const ROTAS_IA = [
  [/^estado$/, ['GET']],
  [/^conversas$/, ['GET']],
  [/^conversas\/[A-Za-z0-9-]{1,64}$/, ['GET', 'DELETE']],
  [/^mensagens$/, ['POST']],
]
const SEM_LOGIN_IA = 'Entre com a conta Absolute ZRO para conversar com a Z.'
// o Set: os caminhos e métodos da API (/api/v1/set, contrato docs/integration-contracts/set.md da Absolute ZRO)
const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const ROTAS_SET = [
  [/^$/, ['GET', 'POST']],
  [/^preferencias$/, ['PUT']],
  [/^contatos$/, ['GET', 'POST']],
  [new RegExp(`^contatos/${ID}$`, 'i'), ['PUT', 'DELETE']],
  [/^bloqueios$/, ['POST']],
  [new RegExp(`^bloqueios/${ID}$`, 'i'), ['DELETE']],
  [/^conversas$/, ['GET', 'POST']],
  [new RegExp(`^conversas/${ID}$`, 'i'), ['GET', 'PATCH']],
  [new RegExp(`^conversas/${ID}/mensagens$`, 'i'), ['POST']],
  [new RegExp(`^mensagens/${ID}$`, 'i'), ['PATCH', 'DELETE']],
  [/^denuncias$/, ['POST']],
]
const ETAG = /^W\/"[A-Za-z0-9_-]{1,64}"$/
const SEM_LOGIN_SET = 'Entre com a conta Absolute ZRO para ver o Set.'

const valor = () => randomBytes(32).toString('base64url')
const desafio = (v) => createHash('sha256').update(v).digest('base64url')
const igual = (a, b) => {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}
const agoraS = () => Math.floor(Date.now() / 1000)

async function buscarJson(url, init, prazoMs = 15_000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(prazoMs) })
  return { status: r.status, corpo: await r.json().catch(() => null) }
}

async function descobrir() {
  const { status, corpo } = await buscarJson(`${EMISSOR}/.well-known/openid-configuration`)
  if (status !== 200 || !corpo || corpo.issuer !== EMISSOR || !corpo.authorization_endpoint || !corpo.token_endpoint || !corpo.jwks_uri) throw new Error('descoberta')
  return corpo
}

/** Endereço só vale se for da própria Absolute ZRO e no caminho esperado (vai para <img> e <a> do app). */
function enderecoDaZro(v, caminho) {
  if (typeof v !== 'string' || v.length > 512) return null
  try {
    const u = new URL(v)
    if (u.origin !== new URL(EMISSOR).origin || u.username || u.password || !u.pathname.startsWith(caminho)) return null
    return u.href
  } catch {
    return null
  }
}

/** A pessoa a partir dos claims (id_token ou /oauth/userinfo). Sem `picture`, foto null: o app mostra as iniciais. */
function pessoaDosClaims(d) {
  const org = d.zro_org && typeof d.zro_org === 'object' && typeof d.zro_org.name === 'string' ? d.zro_org : null
  return {
    sub: d.sub.slice(0, 200),
    nome: typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 120) : null,
    email: d.email.trim().toLowerCase().slice(0, 254),
    foto: enderecoDaZro(d.picture, '/api/v1/foto/'),
    atualizado: Number.isInteger(d.updated_at) && d.updated_at > 0 ? d.updated_at : null,
    conta: enderecoDaZro(d.zro_conta, '/') || `${EMISSOR}/perfil`,
    organizacao: org ? { id: String(org.id || '').slice(0, 100), nome: org.name.slice(0, 120), papel: typeof org.role === 'string' ? org.role.slice(0, 40) : null } : null,
    produtos: Array.isArray(d.zro_products) ? d.zro_products.filter((p) => typeof p === 'string').slice(0, 30) : [],
  }
}

/** Confere o id_token (ES256 pela JWKS, iss, aud, exp, nonce) e devolve a pessoa. */
async function conferir(idToken, nonce, jwksUri) {
  const partes = String(idToken).split('.')
  if (partes.length !== 3) throw new Error('formato')
  const cab = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'))
  const d = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
  if (cab.alg !== 'ES256' || typeof cab.kid !== 'string') throw new Error('algoritmo')
  const { status, corpo } = await buscarJson(jwksUri)
  const jwk = status === 200 && Array.isArray(corpo?.keys) ? corpo.keys.find((k) => k.kid === cab.kid) : null
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new Error('chave desconhecida')
  const ok = verify('sha256', Buffer.from(`${partes[0]}.${partes[1]}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(partes[2], 'base64url'))
  if (!ok) throw new Error('assinatura')
  const s = agoraS()
  const aud = Array.isArray(d.aud) ? d.aud : [d.aud]
  if (d.iss !== EMISSOR) throw new Error('emissor')
  if (!aud.includes(CLIENTE) || (aud.length > 1 && d.azp !== CLIENTE)) throw new Error('público')
  if (typeof d.exp !== 'number' || d.exp < s - 60) throw new Error('expirado')
  if (!igual(d.nonce, nonce)) throw new Error('nonce')
  if (typeof d.sub !== 'string' || !d.sub || typeof d.email !== 'string') throw new Error('sem sub ou e-mail')
  return pessoaDosClaims(d)
}

const tokensDe = (corpo) =>
  typeof corpo?.access_token === 'string'
    ? { at: corpo.access_token, atExp: agoraS() + (Number.isFinite(corpo.expires_in) ? Math.min(corpo.expires_in, 3600) : 600), rt: typeof corpo.refresh_token === 'string' ? corpo.refresh_token : null }
    : null

const PAGINA = (titulo, texto) =>
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Synquei</title><body style="margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;background:#000;color:#f5f5f7;font:17px -apple-system,system-ui,sans-serif"><h1 style="font-weight:700;letter-spacing:-.02em;margin:0 0 10px">${titulo}</h1><p style="color:#a1a1a6;margin:0">${texto}</p></body></html>`

/**
 * pasta: onde guardar conta.json (pasta de dados do app). abrirNavegador(url): abre o navegador da pessoa.
 * aoVoltar(): traz a janela do app para frente quando o login termina.
 * cofre: { cifrar(texto) → texto, decifrar(texto) → texto } do sistema (safeStorage), ou null.
 */
function criarConta({ pasta, abrirNavegador, aoVoltar = () => {}, cofre = null }) {
  const arquivo = path.join(pasta, 'conta.json')
  let emAndamento = null
  let relendo = null
  // tokens desta abertura do app (o access token nunca vai para o disco)
  let mem = null
  // o refresh token RODA: duas trocas ao mesmo tempo (o perfil e a Z) usariam o mesmo token e a Absolute ZRO derrubaria
  // a família inteira. Quem renova entra nesta fila, um de cada vez.
  let fila = Promise.resolve()
  const naFila = (fn) => {
    const vez = fila.then(fn, fn)
    fila = vez.catch(() => {})
    return vez
  }

  function lerArquivo() {
    try {
      const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
      if (!c || typeof c.exp !== 'number' || c.exp < agoraS() || !c.pessoa?.sub) return null
      return c
    } catch {
      return null
    }
  }

  function ler() {
    return lerArquivo()?.pessoa || null
  }

  /** exp: mantém o vencimento da sessão (reler o perfil não estica). rt: refresh token, cifrado pelo cofre. */
  function gravar(pessoa, { exp = agoraS() + CONTA_S, rt = null } = {}) {
    fs.mkdirSync(pasta, { recursive: true })
    let rtCifrado = null
    if (rt && cofre) {
      try {
        rtCifrado = cofre.cifrar(rt)
      } catch {}
    }
    const tmp = `${arquivo}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ pessoa, exp, ...(rtCifrado ? { rt: rtCifrado } : {}) }), { mode: 0o600 })
    fs.renameSync(tmp, arquivo)
  }

  function rtGuardado(c) {
    if (mem?.rt) return mem.rt
    if (!c.rt || !cofre) return null
    try {
      return cofre.decifrar(c.rt)
    } catch {
      return null
    }
  }

  function sair() {
    const c = lerArquivo()
    const rt = c ? rtGuardado(c) : null
    mem = null
    fs.rmSync(arquivo, { force: true })
    // o refresh token deixa de valer na Absolute ZRO (melhor esforço, sem prender a saída)
    if (rt)
      descobrir()
        .then((d) => {
          const fim = enderecoDaZro(d.revocation_endpoint || `${EMISSOR}/oauth/revoke`, '/')
          if (fim) return buscarJson(fim, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: rt, token_type_hint: 'refresh_token', client_id: CLIENTE }).toString() }, PERFIL_MS)
        })
        .catch(() => {})
  }

  /** O mesmo formato do /api/zro/eu do site (api/zro/eu.js): a pessoa, onde editar e se a conta tem o Synquei. null = sem sessão (401). */
  function eu() {
    const p = ler()
    if (!p) return null
    const org = p.organizacao ? { nome: p.organizacao.nome || null, papel: p.organizacao.papel || null } : null
    return {
      ok: true,
      acesso: (p.produtos || []).includes(PRODUTO),
      ferramentas: `${EMISSOR}/ferramentas`,
      pessoa: { nome: p.nome || null, email: p.email || null, foto: enderecoDaZro(p.foto, '/api/v1/foto/'), conta: enderecoDaZro(p.conta, '/') || `${EMISSOR}/perfil`, organizacao: org, produtos: p.produtos || [] },
    }
  }

  /**
   * Relê o perfil na Absolute ZRO (perfil único). Devolve 'ok', 'sem-token' (sem refresh token guardado: fica a
   * cópia até o próximo login), 'recusado' (acesso removido: esquece o token) ou 'erro' (rede: fica a cópia).
   */
  function atualizar() {
    if (relendo) return relendo
    relendo = naFila(async () => {
      const c = lerArquivo()
      if (!c) return 'sem-token'
      const rt = rtGuardado(c)
      if (!rt && !(mem?.at && mem.atExp > agoraS() + 30)) return 'sem-token'
      const d = await descobrir()
      const userinfo = enderecoDaZro(d.userinfo_endpoint || `${EMISSOR}/oauth/userinfo`, '/')
      if (!userinfo) return 'erro'
      const lerPerfil = async (at) => {
        const { status, corpo } = await buscarJson(userinfo, { headers: { accept: 'application/json', authorization: `Bearer ${at}` } }, PERFIL_MS)
        if (status === 401) return null
        if (status !== 200 || !corpo || corpo.sub !== c.pessoa.sub || typeof corpo.email !== 'string') throw new Error('userinfo')
        return pessoaDosClaims(corpo)
      }
      let p = mem?.at && mem.atExp > agoraS() + 30 ? await lerPerfil(mem.at) : null
      if (!p) {
        if (!rt) return 'sem-token'
        const { status, corpo } = await buscarJson(
          d.token_endpoint,
          { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: CLIENTE }).toString() },
          PERFIL_MS,
        )
        // refresh recusado (acesso removido no Perfil, token já usado ou vencido): esquece o token, fica a cópia
        const esquecer = () => {
          mem = null
          gravar(c.pessoa, { exp: c.exp })
          return 'recusado'
        }
        if (status === 400 || status === 401) return esquecer()
        const novos = status === 200 ? tokensDe(corpo) : null
        if (!novos) return 'erro'
        mem = { ...novos, rt: novos.rt || rt }
        p = await lerPerfil(mem.at)
        if (!p) return esquecer()
      }
      gravar(p, { exp: c.exp, rt: mem?.rt || rt })
      return 'ok'
    })
      .catch(() => 'erro')
      .finally(() => (relendo = null))
    return relendo
  }

  /**
   * Access token para a Z: o da memória enquanto vale; senão (ou `forcar`, depois de um 401) troca o refresh token, que
   * roda (o novo vai cifrado para o disco). null: sem sessão ou a Absolute ZRO recusou.
   */
  function tokenIa(opcoes) {
    return naFila(() => tokenIaAgora(opcoes))
  }
  async function tokenIaAgora({ forcar = false } = {}) {
    const c = lerArquivo()
    if (!c) return null
    if (!forcar && mem?.at && mem.atExp > agoraS() + 30) return mem.at
    const rt = rtGuardado(c)
    if (!rt) return null
    const d = await descobrir()
    const { status, corpo } = await buscarJson(
      d.token_endpoint,
      { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: CLIENTE }).toString() },
      PERFIL_MS * 3,
    )
    if (status === 400 || status === 401) {
      mem = null
      gravar(c.pessoa, { exp: c.exp })
      return null
    }
    const novos = status === 200 ? tokensDe(corpo) : null
    if (!novos) throw new Error('refresh')
    mem = { ...novos, rt: novos.rt || rt }
    gravar(c.pessoa, { exp: c.exp, rt: mem.rt })
    return mem.at
  }

  /**
   * /api/zro/ia/<caminho> do app: o mesmo repasse do site (api/zro/ia.js). Encaminha para a API da Z com o token desta
   * sessão e devolve a resposta como veio (o NDJSON de /mensagens segue em pedaços). O token não sai deste processo.
   */
  async function repassarIa(req, caminho) {
    const resp = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    const rota = ROTAS_IA.find(([re]) => re.test(caminho))
    if (!rota) return resp(404, { message: 'Caminho desconhecido.' })
    if (!rota[1].includes(req.method)) return resp(405, { message: 'Método não aceito.' })
    const corpo = req.method === 'POST' ? await req.arrayBuffer() : undefined
    if (corpo && corpo.byteLength > 64 * 1024) return resp(413, { message: 'Mensagem grande demais.' })
    const pedir = (at) =>
      fetch(`${EMISSOR}/api/v1/ia/${caminho}`, {
        method: req.method,
        headers: { authorization: `Bearer ${at}`, accept: req.headers.get('accept') || 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}) },
        body: corpo,
        signal: req.signal,
        redirect: 'manual',
      })
    let r
    try {
      const atAntes = mem?.at && mem.atExp > agoraS() + 30
      let at = await tokenIa()
      if (!at) return resp(401, { message: SEM_LOGIN_IA, reconectar: true })
      r = await pedir(at)
      if (r.status === 401 && atAntes) {
        await r.body?.cancel().catch(() => {})
        at = await tokenIa({ forcar: true })
        if (!at) return resp(401, { message: SEM_LOGIN_IA, reconectar: true })
        r = await pedir(at)
      }
    } catch {
      return resp(502, { message: 'A Z não respondeu agora. Tente de novo.' })
    }
    // login de antes da Z (token sem zro.ia): entrar de novo já pede a Z
    if (r.status === 401) {
      await r.body?.cancel().catch(() => {})
      return resp(401, { message: SEM_LOGIN_IA, reconectar: true })
    }
    return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
  }

  /**
   * /api/zro/set/<caminho> do app: o mesmo repasse do site (api/zro/set.js), com o token desta sessão (o mesmo da Z,
   * pela mesma fila: dois pedidos nunca trocam o refresh token juntos). A ETag do widget segue e o 304 volta sem corpo.
   * Um 401 da Absolute ZRO (login de antes do Set) não apaga a sessão: o widget só some.
   */
  async function repassarSet(req, caminho, busca = '') {
    const resp = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
    const rota = ROTAS_SET.find(([re]) => re.test(caminho))
    if (!rota) return resp(404, { message: 'Não encontrado.' })
    if (!rota[1].includes(req.method)) return resp(405, { message: 'Método não aceito.' })
    const comCorpo = req.method !== 'GET' && req.method !== 'DELETE'
    if (comCorpo && !/^application\/json\b/i.test(req.headers.get('content-type') || '')) return resp(415, { message: 'Mande JSON.' })
    const corpo = comCorpo ? await req.arrayBuffer() : undefined
    if (corpo && corpo.byteLength > 20_000) return resp(413, { message: 'Mensagem grande demais.' })
    const q = new URLSearchParams()
    if (req.method === 'GET' && /^conversas\/[^/]+$/.test(caminho)) {
      const b = new URLSearchParams(busca)
      for (const k of ['antes', 'depois', 'limite']) if (/^\d{1,15}$/.test(b.get(k) || '')) q.set(k, b.get(k))
    }
    const pedida = req.headers.get('if-none-match') || ''
    let r
    try {
      const at = await tokenIa()
      if (!at) return resp(401, { message: SEM_LOGIN_SET, reconectar: true })
      r = await fetch(`${EMISSOR}/api/v1/set${caminho ? `/${caminho}` : ''}${q.size ? `?${q}` : ''}`, {
        method: req.method,
        headers: {
          authorization: `Bearer ${at}`,
          accept: 'application/json',
          ...(corpo ? { 'content-type': 'application/json' } : {}),
          ...(req.method === 'GET' && pedida.length <= 200 && ETAG.test(pedida) ? { 'if-none-match': pedida } : {}),
        },
        body: corpo,
        signal: AbortSignal.timeout(20_000),
        redirect: 'manual',
      })
    } catch {
      return resp(502, { message: 'A Absolute ZRO não respondeu agora. Tente de novo.' })
    }
    if (r.status === 401) {
      await r.body?.cancel().catch(() => {})
      return resp(401, { message: SEM_LOGIN_SET, reconectar: true })
    }
    const headers = { 'cache-control': 'no-store' }
    if (r.headers.get('content-type')) headers['content-type'] = r.headers.get('content-type')
    if (ETAG.test(r.headers.get('etag') || '')) headers.etag = r.headers.get('etag')
    const semCorpo = r.status === 204 || r.status === 304
    if (semCorpo) await r.body?.cancel().catch(() => {})
    return new Response(semCorpo ? null : await r.arrayBuffer(), { status: r.status, headers })
  }

  /** Login completo. Devolve 'ok', 'recusado', 'expirou' ou 'erro' (os mesmos avisos do site). */
  async function entrar({ criar = false } = {}) {
    // Absolute ZRO de antes do Set (recusou zro.set): uma segunda ida sem ele; quem já entrou volta na hora
    const r = await entrarCom({ criar, escopos: ESCOPOS })
    return r === 'escopo' ? entrarCom({ criar, escopos: ESCOPOS_SEM_SET }).then((x) => (x === 'escopo' ? 'erro' : x)) : r
  }
  function entrarCom({ criar, escopos }) {
    if (emAndamento) return emAndamento
    emAndamento = (async () => {
      const d = await descobrir()
      const state = valor()
      const nonce = valor()
      const verificador = valor()
      const servidor = http.createServer()
      await new Promise((ok, falha) => servidor.listen(0, '127.0.0.1', ok).on('error', falha))
      const retorno = `http://127.0.0.1:${servidor.address().port}/callback`
      try {
        const volta = new Promise((ok) => {
          const prazo = setTimeout(() => ok({ erro: 'expirou' }), ESPERA_MS)
          servidor.on('request', (req, res) => {
            const u = new URL(req.url, retorno)
            if (u.pathname !== '/callback') return res.writeHead(404).end()
            clearTimeout(prazo)
            const q = u.searchParams
            const fim = (resultado, titulo, texto) => {
              res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(PAGINA(titulo, texto))
              ok(resultado)
            }
            if (!igual(q.get('state'), state)) return fim({ erro: 'expirou' }, 'A entrada expirou.', 'Volte ao Synquei e tente de novo.')
            if (q.get('error') === 'invalid_scope' && escopos !== ESCOPOS_SEM_SET) return fim({ erro: 'escopo' }, 'Quase lá.', 'Volte ao Synquei: ele termina de entrar.')
            if (q.get('error')) return fim({ erro: q.get('error') === 'access_denied' ? 'recusado' : 'erro' }, 'Não entrou.', 'Volte ao Synquei quando quiser.')
            if (q.has('iss') && q.get('iss') !== EMISSOR) return fim({ erro: 'erro' }, 'Não entrou.', 'Volte ao Synquei e tente de novo.')
            fim({ code: q.get('code') }, 'Pronto.', 'Pode voltar ao Synquei.')
          })
        })
        const a = new URL(d.authorization_endpoint)
        a.search = new URLSearchParams({ response_type: 'code', client_id: CLIENTE, redirect_uri: retorno, scope: escopos, state, nonce, code_challenge: desafio(verificador), code_challenge_method: 'S256', ...(criar ? { prompt: 'create' } : {}) }).toString()
        await abrirNavegador(a.toString())
        const r = await volta
        if (r.erro || !r.code) return r.erro || 'erro'
        const { status, corpo } = await buscarJson(d.token_endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code: r.code, code_verifier: verificador, redirect_uri: retorno, client_id: CLIENTE }).toString(),
        })
        if (status !== 200 || typeof corpo?.id_token !== 'string') return 'erro'
        const pessoa = await conferir(corpo.id_token, nonce, d.jwks_uri)
        mem = tokensDe(corpo)
        gravar(pessoa, { rt: mem?.rt })
        return 'ok'
      } finally {
        servidor.close()
        aoVoltar()
      }
    })()
      .catch(() => 'erro')
      .finally(() => (emAndamento = null))
    return emAndamento
  }

  return { eu, entrar, sair, atualizar, ler, gravar, tokenIa, repassarIa, repassarSet }
}

module.exports = { criarConta, CLIENTE, EMISSOR, PRODUTO }
