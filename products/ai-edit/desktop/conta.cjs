// O AEON de computador só abre com a conta Absolute ZRO (decisão do titular, 26/10/2026). App nativo, então o login é
// o de app público do OpenID Connect (RFC 8252): o navegador da pessoa abre a Absolute ZRO, ela entra (ou já está
// logada) e a Absolute ZRO volta para http://127.0.0.1:<porta>/callback, onde este processo está ouvindo só durante o
// login. Código + PKCE S256, state e nonce; o id_token é conferido pela chave pública (JWKS) da Absolute ZRO.
// Cliente "aeon-desktop" (público: sem segredo no app, que é aberto). Fica guardado quem é a pessoa (a cópia do perfil),
// por 30 dias, na pasta de dados do app.
//
// Perfil único (docs/integration-contracts/perfil-unico.md): nome, e-mail e foto são da conta Absolute ZRO. A cada
// abertura (`atualizar`) o app relê o perfil no /oauth/userinfo, renovando o access token pelo refresh token, e
// regrava a cópia: mudou na conta, muda no app sem a pessoa fazer nada. O refresh token só vai para o disco cifrado
// pelo cofre do sistema (Keychain no Mac, DPAPI no Windows: `cofre`, de safeStorage em desktop/main.cjs). Sem cofre,
// fica só na memória enquanto o app está aberto. O access token nunca vai para o disco.
//
// A página é a mesma do site (entrar.html + app/editor.js), e as rotas também: o protocolo do app responde
// /api/zro/eu, /api/zro/entrar e /api/zro/sair daqui (desktop/main.cjs). A Z (/api/zro/ia/*) também: o access token
// fica neste processo e a página nunca o vê (`tokenDeAcesso`).

const { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } = require('node:crypto')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const EMISSOR = (process.env.ZRO_ISSUER || 'https://absolutezro.com').replace(/\/+$/, '')
const CLIENTE = 'aeon-desktop'
const PRODUTO = 'ai-edit'
// zro.ia: o mesmo token fala com a Z (a IA do ecossistema), só pelo processo principal (desktop/main.cjs › repassarIa)
// zro.set: o Set (presença e conversas), pelo mesmo processo (desktop/main.cjs › repassarSet)
// zro.sons: os efeitos sonoros livres da Sonoplasta (desktop/main.cjs › repassarSons)
const ESCOPOS = 'openid email profile org offline_access zro.ia zro.set zro.sons'
const CONTA_S = 30 * 24 * 3600
const ESPERA_MS = 10 * 60 * 1000
// reler o perfil não pode prender a abertura do app: sem resposta nesse prazo, vale a cópia
const PERFIL_MS = 3_000

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
    organizacao: org ? { id: String(org.id || '').slice(0, 100), nome: org.name.slice(0, 120) } : null,
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
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>AEON</title><body style="margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;background:#000;color:#f5f5f7;font:17px -apple-system,system-ui,sans-serif"><h1 style="font-weight:700;letter-spacing:-.02em;margin:0 0 10px">${titulo}</h1><p style="color:#a1a1a6;margin:0">${texto}</p></body></html>`

/**
 * pasta: onde guardar conta.json (pasta de dados do app). abrirNavegador(url): abre o navegador da pessoa.
 * aoVoltar(): traz a janela do app para frente quando o login termina.
 * cofre: { cifrar(texto) → texto, decifrar(texto) → texto } do sistema (safeStorage), ou null.
 */
function criarConta({ pasta, abrirNavegador, aoVoltar = () => {}, cofre = null }) {
  const arquivo = path.join(pasta, 'conta.json')
  let emAndamento = null
  let relendo = null
  let renovando = null
  // tokens desta abertura do app (o access token nunca vai para o disco)
  let mem = null

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

  /** O mesmo formato do /api/zro/eu do site: 200 com a pessoa e se a conta tem o AEON; null = sem sessão (401). */
  function eu() {
    const p = ler()
    if (!p) return null
    return {
      ok: true,
      pessoa: { nome: p.nome || null, email: p.email || null, foto: enderecoDaZro(p.foto, '/api/v1/foto/'), organizacao: p.organizacao || null, produtos: p.produtos || [] },
      acesso: (p.produtos || []).includes(PRODUTO),
      ferramentas: `${EMISSOR}/ferramentas`,
      conta: enderecoDaZro(p.conta, '/') || `${EMISSOR}/perfil`,
    }
  }

  /**
   * Relê o perfil na Absolute ZRO (perfil único). Devolve 'ok', 'sem-token' (sem refresh token guardado: fica a
   * cópia até o próximo login), 'recusado' (acesso removido: esquece o token) ou 'erro' (rede: fica a cópia).
   */
  function atualizar() {
    if (relendo) return relendo
    relendo = (async () => {
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
        const r = await renovar()
        if (r !== 'ok') return r
        p = await lerPerfil(mem.at)
        // refresh recusado (acesso removido no Perfil, token já usado ou vencido): esquece o token, fica a cópia
        if (!p) {
          mem = null
          gravar(c.pessoa, { exp: c.exp })
          return 'recusado'
        }
      }
      gravar(p, { exp: c.exp, rt: mem?.rt || rt })
      return 'ok'
    })()
      .catch(() => 'erro')
      .finally(() => (relendo = null))
    return relendo
  }

  /**
   * Access token novo pelo refresh token (que gira a cada uso). Um pedido por vez: reler o perfil e a Z ao mesmo tempo
   * não podem gastar o mesmo refresh token duas vezes (a Absolute ZRO derrubaria a família inteira).
   * 'ok' (mem tem o token novo), 'sem-token', 'recusado' (esquece o token, fica a cópia) ou 'erro' (rede).
   */
  function renovar() {
    if (renovando) return renovando
    renovando = (async () => {
      const c = lerArquivo()
      if (!c) return 'sem-token'
      const rt = rtGuardado(c)
      if (!rt) return 'sem-token'
      const d = await descobrir()
      const { status, corpo } = await buscarJson(
        d.token_endpoint,
        { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: CLIENTE }).toString() },
        PERFIL_MS,
      )
      if (status === 400 || status === 401) {
        mem = null
        gravar(c.pessoa, { exp: c.exp })
        return 'recusado'
      }
      const novos = status === 200 ? tokensDe(corpo) : null
      if (!novos) return 'erro'
      mem = { ...novos, rt: novos.rt || rt }
      // o refresh token novo vai para o disco (cifrado pelo cofre) na hora: o antigo já não vale
      gravar(c.pessoa, { exp: c.exp, rt: mem.rt })
      return 'ok'
    })()
      .catch(() => 'erro')
      .finally(() => (renovando = null))
    return renovando
  }

  /**
   * O access token de agora, para a Z (desktop/main.cjs repassa /api/zro/ia/* com ele). Só fica neste processo:
   * nunca vai para a página, para o disco ou para o log. Sem sessão ou com o acesso removido: null (a página pede
   * entrar de novo). Rede fora: lança (a página mostra que a Z está sem conexão).
   */
  async function tokenDeAcesso() {
    if (!lerArquivo()) return null
    if (mem?.at && mem.atExp > agoraS() + 30) return mem.at
    const r = await renovar()
    if (r === 'erro') throw new Error('sem conexão')
    return r === 'ok' ? mem.at : null
  }

  /** A Absolute ZRO recusou o token antes da validade (acesso removido): a próxima chamada renova. */
  function esquecerAcesso() {
    if (mem) mem = { ...mem, at: null, atExp: 0 }
  }

  /** Login completo. Devolve 'ok', 'recusado', 'expirou' ou 'erro' (os mesmos avisos do site). */
  function entrar({ criar = false } = {}) {
    if (emAndamento) return emAndamento
    // cliente ainda sem o escopo dos sons, do Set ou da Z na Absolute ZRO (invalid_scope): o login não quebra por causa
    // deles; tenta sem os sons, depois sem o Set e, se ainda recusar, sem a Z também
    emAndamento = tentar({ criar, semSons: false, semSet: false, semIa: false })
      .then((r) => (r === 'escopo' ? tentar({ criar, semSons: true, semSet: false, semIa: false }) : r))
      .then((r) => (r === 'escopo' ? tentar({ criar, semSons: true, semSet: true, semIa: false }) : r))
      .then((r) => (r === 'escopo' ? tentar({ criar, semSons: true, semSet: true, semIa: true }) : r))
      .then((r) => (r === 'escopo' ? 'erro' : r))
      .catch(() => 'erro')
      .finally(() => (emAndamento = null))
    return emAndamento
  }

  /** Uma ida e volta pelo navegador. 'escopo': a Absolute ZRO recusou zro.sons, zro.set ou zro.ia (entrar() tenta sem ele). */
  async function tentar({ criar, semSons, semSet, semIa }) {
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
          if (!igual(q.get('state'), state)) return fim({ erro: 'expirou' }, 'A entrada expirou.', 'Volte ao AEON e tente de novo.')
          if (q.get('error') === 'invalid_scope' && !semIa) return fim({ erro: 'escopo' }, 'Quase lá.', 'Volte ao AEON.')
          if (q.get('error')) return fim({ erro: q.get('error') === 'access_denied' ? 'recusado' : 'erro' }, 'Não entrou.', 'Volte ao AEON quando quiser.')
          if (q.has('iss') && q.get('iss') !== EMISSOR) return fim({ erro: 'erro' }, 'Não entrou.', 'Volte ao AEON e tente de novo.')
          fim({ code: q.get('code') }, 'Pronto.', 'Pode voltar ao AEON.')
        })
      })
      const a = new URL(d.authorization_endpoint)
      a.search = new URLSearchParams({ response_type: 'code', client_id: CLIENTE, redirect_uri: retorno, scope: ESCOPOS.replace(semSons ? / ?zro\.sons/ : '', '').replace(semSet ? / ?zro\.set/ : '', '').replace(semIa ? / ?zro\.ia/ : '', ''), state, nonce, code_challenge: desafio(verificador), code_challenge_method: 'S256', ...(criar ? { prompt: 'create' } : {}) }).toString()
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
  }

  return { eu, entrar, sair, atualizar, ler, gravar, tokenDeAcesso, esquecerAcesso }
}

module.exports = { criarConta, CLIENTE, EMISSOR }
