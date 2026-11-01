// Absolute ZRO falsa para os testes do "Entrar com Absolute ZRO": descoberta OIDC, /oauth/authorize (devolve o
// código na hora, como app da família), /oauth/token (confere client_secret_basic, ou client_id de app público, PKCE
// S256, redirect_uri e uso único; refresh token que gira a cada uso e recusa reuso), /oauth/userinfo (o perfil de
// agora: mudar `estado.pessoa` é a pessoa mudar o nome ou a foto na conta), /oauth/revoke e JWKS. Assina o id_token
// com uma chave EC P-256 gerada aqui. `adulterar` gera tokens ruins de propósito.
//
// Pessoa: { sub, email, nome, org, produtos, foto, atualizado, release }. `foto` é o id da foto: o claim picture vira
// <emissor>/api/v1/foto/<foto> (sem foto, sem claim, como no HUB). `release` é a claim zro_release do gate de
// lançamento ({ '<produto>': 'released' | 'closed' | 'allowed' }); sem ela, a claim não sai (HUB de antes do gate).
// `estado.gate = '<produto>'` liga o gate do HUB de verdade para esse produto: conta sem 'allowed' não recebe código
// (access_denied), o refresh devolve invalid_grant e o userinfo e a API da Z respondem 401.

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import http from 'node:http'

export async function iniciarZroFalsa(cliente) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'chave-teste', alg: 'ES256', use: 'sig' }
  const codigos = new Map()
  const acessos = new Map()
  const escoposDe = new Map()
  const renovaveis = new Map()
  const estado = { pessoa: null, negar: false, adulterar: null, trocas: 0, prompt: null, escopo: null, expiraEm: 600, renovacoes: 0, leituras: 0, revogados: [], recusarRenovacao: false, ia: [], set: [], sons: [], gate: null, higgsfield: [], hf: null }
  let base = ''
  /** O gate do HUB barra esta pessoa? (produto fechado e a conta fora da lista) */
  const barrada = () => !!estado.gate && estado.pessoa?.release?.[estado.gate] !== 'allowed'

  const jwt = (dados, assinarErrado = false) => {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const cab = `${b({ alg: 'ES256', typ: 'JWT', kid: jwk.kid })}.${b(dados)}`
    const chave = assinarErrado ? generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey : privateKey
    return `${cab}.${sign('sha256', Buffer.from(cab), { key: chave, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
  }
  const responder = (res, status, corpo) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corpo))
  }
  /** Claims de perfil, e-mail e organização, como o HUB (packages/auth/src/oidc.ts › profileClaims). */
  const claims = (p) => ({
    email: p.email,
    email_verified: true,
    name: p.nome,
    ...(p.foto ? { picture: estado.adulterar === 'foto-fora' ? `https://outro.exemplo/api/v1/foto/${p.foto}` : `${base}/api/v1/foto/${p.foto}` } : {}),
    updated_at: p.atualizado ?? 1_790_000_000,
    zro_conta: `${base}/perfil`,
    zro_org: p.org ? { id: 'org-1', name: p.org, role: 'owner' } : null,
    zro_products: p.produtos || [],
    ...(p.release ? { zro_release: p.release } : {}),
  })
  const tokens = (sub, escopos = []) => {
    const at = `at_${randomBytes(16).toString('hex')}`
    const rt = `rt_${randomBytes(16).toString('hex')}`
    acessos.set(at, sub)
    escoposDe.set(at, escopos)
    renovaveis.set(rt, { sub, usado: false, escopos })
    return { access_token: at, token_type: 'Bearer', expires_in: estado.expiraEm, refresh_token: rt }
  }
  const cliente_ok = (req, f) => {
    const basic = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString()
    // app público (o de computador): sem segredo, só client_id no corpo
    return cliente.publico ? f.get('client_id') === cliente.clientId && !req.headers.authorization : basic === `${cliente.clientId}:${cliente.clientSecret}`
  }
  // o cliente só recebe o escopo da Z se tiver pedido (como no HUB: zro.ia está na lista dos apps da família)
  const escopos_ok = (e) => e.filter((x) => x !== 'zro.ia' || estado.semEscopoIa !== true)
  const corpoDe = async (req) => {
    let corpo = ''
    for await (const c of req) corpo += c
    return new URLSearchParams(corpo)
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    if (url.pathname === '/.well-known/openid-configuration') {
      return responder(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        userinfo_endpoint: `${base}/oauth/userinfo`,
        revocation_endpoint: `${base}/oauth/revoke`,
        jwks_uri: `${base}/oauth/jwks`,
      })
    }
    if (url.pathname === '/oauth/jwks') return responder(res, 200, { keys: [jwk] })
    if (url.pathname === '/oauth/authorize') {
      const q = url.searchParams
      // prompt=create: o HUB de verdade abre /criar-conta antes de voltar; aqui só registra o pedido
      estado.prompt = q.get('prompt')
      estado.escopo = q.get('scope')
      const volta = new URL(q.get('redirect_uri'))
      volta.searchParams.set('state', q.get('state'))
      const escopos = (q.get('scope') || '').split(' ')
      if (q.get('client_id') !== cliente.clientId || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge') || !q.get('nonce') || !escopos.includes('openid')) {
        volta.searchParams.set('error', 'invalid_request')
      } else if (estado.recusarEscopoHf && escopos.includes('zro.higgsfield')) {
        // Absolute ZRO de antes da Higgsfield nas Conexões
        volta.searchParams.set('error', 'invalid_scope')
      } else if (estado.recusarEscopoSons && escopos.includes('zro.sons')) {
        // Absolute ZRO de antes da Sonoplasta (zro.sons fora da lista do cliente)
        volta.searchParams.set('error', 'invalid_scope')
      } else if (estado.recusarEscopoSet && escopos.includes('zro.set')) {
        // Absolute ZRO de antes do Set (zro.set fora da lista do cliente)
        volta.searchParams.set('error', 'invalid_scope')
      } else if (estado.recusarEscopoIa && escopos.includes('zro.ia')) {
        // cliente sem zro.ia na lista (o HUB devolve invalid_scope)
        volta.searchParams.set('error', 'invalid_scope')
      } else if (estado.negar || !estado.pessoa || barrada()) {
        // o HUB de verdade mostra "Em desenvolvimento" em vez de voltar; com prompt=none volta access_denied
        volta.searchParams.set('error', 'access_denied')
      } else {
        const code = `zc_${randomBytes(16).toString('hex')}`
        codigos.set(code, { desafio: q.get('code_challenge'), redirectUri: q.get('redirect_uri'), pessoa: estado.pessoa, nonce: q.get('nonce'), escopos, usado: false })
        volta.searchParams.set('code', code)
        volta.searchParams.set('iss', base)
      }
      res.writeHead(302, { location: volta.toString() })
      return res.end()
    }
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      const f = await corpoDe(req)
      if (!cliente_ok(req, f)) return responder(res, 401, { error: 'invalid_client' })
      if (f.get('grant_type') === 'refresh_token') {
        const r = renovaveis.get(f.get('refresh_token') || '')
        if (!r || r.usado || estado.recusarRenovacao || barrada()) return responder(res, 400, { error: 'invalid_grant' })
        r.usado = true
        estado.renovacoes++
        return responder(res, 200, { ...tokens(r.sub, r.escopos), scope: r.escopos.join(' ') })
      }
      const c = codigos.get(f.get('code') || '')
      if (!c || c.usado) return responder(res, 400, { error: 'invalid_grant' })
      c.usado = true
      const desafio = createHash('sha256')
        .update(f.get('code_verifier') || '')
        .digest('base64url')
      if (desafio !== c.desafio || f.get('redirect_uri') !== c.redirectUri) return responder(res, 400, { error: 'invalid_grant' })
      estado.trocas++
      const agora = Math.floor(Date.now() / 1000)
      const ad = estado.adulterar
      const id = jwt(
        {
          iss: ad === 'emissor' ? 'https://outro.exemplo' : base,
          sub: c.pessoa.sub,
          aud: ad === 'aud' ? 'outro-app' : cliente.clientId,
          iat: agora,
          exp: ad === 'expirado' ? agora - 3600 : agora + 600,
          auth_time: agora,
          nonce: ad === 'nonce' ? 'nonce-errado' : c.nonce,
          ...claims(c.pessoa),
        },
        ad === 'assinatura',
      )
      const t = tokens(c.pessoa.sub, escopos_ok(c.escopos))
      // sem offline_access, sem refresh token (como no HUB)
      if (!c.escopos.includes('offline_access')) delete t.refresh_token
      return responder(res, 200, { ...t, id_token: id, scope: c.escopos.join(' ') })
    }
    if (url.pathname === '/oauth/userinfo') {
      const at = String(req.headers.authorization || '').replace(/^Bearer /, '')
      const sub = acessos.get(at)
      if (!sub || !estado.pessoa || estado.pessoa.sub !== sub || barrada()) return responder(res, 401, { error: 'invalid_token' })
      estado.leituras++
      return responder(res, 200, { sub, ...claims(estado.pessoa) })
    }
    if (url.pathname === '/oauth/revoke' && req.method === 'POST') {
      const f = await corpoDe(req)
      if (!cliente_ok(req, f)) return responder(res, 401, { error: 'invalid_client' })
      const r = renovaveis.get(f.get('token') || '')
      if (r) r.usado = true
      estado.revogados.push(f.get('token'))
      return responder(res, 200, {})
    }
    // os sons (/api/v1/sons): Bearer com o escopo zro.sons, como no HUB (sem ele, 401). Busca devolve um som; o arquivo,
    // 4 bytes de "áudio" com os cabeçalhos X-Zro-Som-*. Guarda o que chegou.
    if (url.pathname.startsWith('/api/v1/sons/')) {
      const at = String(req.headers.authorization || '').replace(/^Bearer /, '')
      estado.sons.push({ caminho: url.pathname.slice('/api/v1/sons'.length), consulta: url.search, autorizacao: req.headers.authorization || null, cookie: req.headers.cookie || null })
      const sub = acessos.get(at)
      if (!sub || !(escoposDe.get(at) || []).includes('zro.sons') || barrada()) return responder(res, 401, { error: 'unauthenticated', message: 'Token inválido, vencido ou sem permissão para esta ação.' })
      if (url.pathname === '/api/v1/sons/buscar')
        return responder(res, 200, { sons: [{ id: 'eab8a6e2-0ac8-4615-9e0d-ebde30523783', origem: 'openverse', titulo: 'Deep Whoosh', autor: 'Kinoton', licenca: 'CC0 1.0', licencaUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', pagina: 'https://freesound.org/s/1', fonte: 'Freesound', duracao: 1.2, formato: 'mp3', bytes: 4 }], pagina: 1, paginas: 1 })
      // os sons originais da Absolute ZRO: uma categoria com um som em duas versões
      if (url.pathname === '/api/v1/sons/zro')
        return responder(res, 200, { categorias: [{ nome: 'Impactos', total: 1 }], sons: [{ id: 'boom-grave', origem: 'zro', titulo: 'Boom grave', categoria: 'Impactos', versoes: [{ id: 'boom-grave-v2', versao: 2, duracao: 1.8, bytes: 4, formato: 'mp3', melhor: true }, { id: 'boom-grave-v1', versao: 1, duracao: 2.5, bytes: 4, formato: 'mp3', melhor: false }] }] })
      // o banco no Drive (pelo SOBEDESCE no HUB): uma subpasta e um som; pasta "1SemDriveConectado" = Drive não conectado
      if (url.pathname === '/api/v1/sons/banco') {
        const pasta = url.searchParams.get('pasta') || ''
        if (pasta === '1SemDriveConectado') return responder(res, 409, { error: 'sem_conexao', message: 'Conecte o seu Google Drive no SOBEDESCE para usar o seu banco de sons.' })
        if (!/^[A-Za-z0-9_-]{10,200}$/.test(pasta)) return responder(res, 422, { error: 'invalid_input', message: 'Cole o link da pasta do Drive com os seus sons.' })
        const q = (url.searchParams.get('q') || '').toLowerCase()
        const sons = [{ id: '1WhooshDoBancoXyz', origem: 'banco', titulo: 'Whoosh grave', nome: 'Whoosh grave.mp3', formato: 'mp3', bytes: 4, conta: 'c1' }].filter((s) => !q || s.titulo.toLowerCase().includes(q))
        return responder(res, 200, { pasta: { id: pasta, nome: pasta === '1PastaWhooshesAbc' ? 'Whooshes' : 'Meus SFX' }, conta: 'c1', pastas: pasta === '1PastaWhooshesAbc' ? [] : [{ id: '1PastaWhooshesAbc', nome: 'Whooshes' }], sons, proxima: null })
      }
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': '4', 'x-zro-som-id': url.pathname.split('/').pop(), ...(url.pathname.startsWith('/api/v1/sons/banco/') ? {} : { 'x-zro-som-licenca': encodeURIComponent('CC0 1.0') }) })
      return res.end(Buffer.from([1, 2, 3, 4]))
    }
    // a Higgsfield das Conexões (/api/v1/higgsfield): Bearer com o escopo zro.higgsfield, como no HUB (sem ele, 401).
    // `estado.hf` é a conta: null = não conectada (409 sem_conexao); { saldo, precos, pedidos } conectada. Gerar desconta
    // o preço e cria um pedido; `andamento` o leva de na_fila a pronto na segunda leitura, com resultados na "CDN"
    // (https://d1.cloudfront.net/..., que o teste de tela atende). Guarda o que chegou em estado.higgsfield.
    if (url.pathname === '/api/v1/higgsfield' || url.pathname === '/api/v1/higgsfield/gerar') {
      const at = (req.headers.authorization || '').replace(/^Bearer /, '')
      const sub = acessos.get(at)
      let corpo = ''
      for await (const c of req) corpo += c
      estado.higgsfield.push({ metodo: req.method, caminho: url.pathname.slice('/api/v1/higgsfield'.length), busca: url.search, autorizacao: req.headers.authorization || null, cookie: req.headers.cookie || null, corpo })
      if (!sub || !(escoposDe.get(at) || []).includes('zro.higgsfield') || barrada()) return responder(res, 401, { error: 'unauthenticated', message: 'Token inválido, vencido ou sem permissão para esta ação.' })
      const h = estado.hf
      if (!h) return responder(res, 409, { error: 'sem_conexao', message: 'Conecte a Higgsfield na sua conta Absolute ZRO.', details: { motivo: 'nenhuma', conectar: `${base}/conexoes`, provedor: 'higgsfield' } })
      let pedido = {}
      try {
        pedido = req.method === 'POST' ? JSON.parse(corpo || '{}') : {}
      } catch {
        return responder(res, 422, { error: 'invalid_input', message: 'JSON inválido.' })
      }
      const longo = (req.method === 'POST' ? pedido.duracao : url.searchParams.get('duracao')) === 'longo'
      const opcoes = [
        { id: 'rapido', nome: 'Rápido', desc: 'Prévia ágil para testar a ideia', segundos: longo ? 10 : 5, creditos: h.precos.rapido * (longo ? 2 : 1) },
        { id: 'equilibrado', nome: 'Equilibrado', desc: 'Movimento de cinema, ótimo custo', segundos: longo ? 10 : 5, creditos: h.precos.equilibrado * (longo ? 2 : 1) },
        { id: 'maximo', nome: 'Máxima qualidade', desc: 'Mais detalhe, física e acabamento', segundos: longo ? 10 : 5, creditos: h.precos.maximo * (longo ? 2 : 1) },
      ]
      if (url.pathname === '/api/v1/higgsfield') {
        const usado = h.pedidos.reduce((n, x) => n + x.creditos, 0)
        return responder(res, 200, { conectada: true, conta: 'lia@higgsfield.test', plano: 'creator', saldo: h.saldo, usoMes: usado, usoApp: { mes: usado, pedidos: h.pedidos.length, total: usado }, usoApps: usado, imagens: [1, 2, 4].map((n) => ({ quantidade: n, creditos: h.precos.imagem * n })), opcoes })
      }
      if (req.method === 'GET') {
        const x = h.pedidos.find((p) => p.id === url.searchParams.get('id'))
        if (!x) return responder(res, 404, { error: 'not_found', message: 'Pedido não encontrado.' })
        x.leituras++
        const pronto = x.leituras >= 2
        const urls = pronto ? Array.from({ length: x.quantidade }, (_, i) => `https://d1.cloudfront.net/aeon-teste/${x.id}-${i}.${x.saida === 'video' ? 'mp4' : 'png'}`) : []
        return responder(res, 200, { estado: pronto ? 'pronto' : x.leituras === 1 ? 'na_fila' : 'gerando', saida: x.saida, urls, erro: null })
      }
      const d = pedido
      if (d.acao === 'envio') return responder(res, 200, { upload_url: 'https://upload.higgsfield.ai/aeon-teste/ref.jpg?assinado=1', headers: { 'Content-Type': d.tipo }, ref: '0b9d7f3e-1c2a-4e5b-8f6a-7d8c9e0f1a2b' })
      const custo = d.acao === 'telas' ? h.precos.imagem * Number(d.quantidade || 2) : opcoes.find((o) => o.id === d.opcao)?.creditos
      if (custo == null) return responder(res, 422, { error: 'invalid_input', message: 'Escolha uma das três opções.' })
      if (custo > h.saldo) return responder(res, 429, { error: 'quota_exceeded', message: `Faltam créditos: custa ${custo} e você tem ${h.saldo}.` })
      h.saldo -= custo
      const id = `p${String(h.pedidos.length + 1).padStart(11, '0')}`
      h.pedidos.push({ id, saida: d.acao === 'telas' ? 'imagem' : 'video', quantidade: d.acao === 'telas' ? Number(d.quantidade || 2) : 1, creditos: custo, leituras: 0, pedido: d })
      return responder(res, 200, { id, estado: 'na_fila', creditos: custo })
    }

    // a API da Z (/api/v1/ia): Bearer com o escopo zro.ia, como no HUB (sem ele, 401). Guarda o que chegou.
    if (url.pathname.startsWith('/api/v1/ia/')) {
      const at = String(req.headers.authorization || '').replace(/^Bearer /, '')
      let corpo = ''
      for await (const c of req) corpo += c
      estado.ia.push({ metodo: req.method, caminho: url.pathname.slice('/api/v1/ia'.length), autorizacao: req.headers.authorization || null, cookie: req.headers.cookie || null, corpo })
      const sub = acessos.get(at)
      if (!sub || !(escoposDe.get(at) || []).includes('zro.ia') || barrada()) return responder(res, 401, { error: 'unauthenticated', message: 'Token inválido, vencido ou sem permissão para esta ação.' })
      const caminho = url.pathname.slice('/api/v1/ia'.length)
      if (caminho === '/estado') return responder(res, 200, { ligada: true, nome: (estado.pessoa?.nome || '').split(' ')[0], produto: null, creditos: { usados: 3, limite: 100, renova_em: '2026-11-27T00:00:00.000Z' } })
      if (caminho === '/conversas') return responder(res, 200, { conversas: [] })
      if (caminho === '/mensagens' && req.method === 'POST') {
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' })
        res.write(JSON.stringify({ tipo: 'conversa', id: 'c-1' }) + '\n')
        await new Promise((ok) => setTimeout(ok, 120))
        res.write(JSON.stringify({ tipo: 'texto', t: 'Oi, ' }) + '\n')
        await new Promise((ok) => setTimeout(ok, 120))
        res.write(JSON.stringify({ tipo: 'texto', t: 'aqui é a Z.' }) + '\n')
        return res.end(JSON.stringify({ tipo: 'fim', creditos: 1 }) + '\n')
      }
      if (/^\/conversas\/[\w-]+$/.test(caminho)) return responder(res, req.method === 'DELETE' ? 200 : 404, req.method === 'DELETE' ? { ok: true } : { message: 'Conversa não encontrada.' })
      return responder(res, 404, { error: 'not_found' })
    }
    // a API do Set (/api/v1/set): Bearer com o escopo zro.set, como no HUB (sem ele, 401). Leitura com ETag (W/"v1"):
    // com If-None-Match igual, 304 sem corpo. Guarda o que chegou em estado.set.
    if (url.pathname === '/api/v1/set' || url.pathname.startsWith('/api/v1/set/')) {
      const at = String(req.headers.authorization || '').replace(/^Bearer /, '')
      let corpo = ''
      for await (const c of req) corpo += c
      const caminho = url.pathname.slice('/api/v1/set'.length)
      estado.set.push({ metodo: req.method, caminho, busca: url.search, autorizacao: req.headers.authorization || null, cookie: req.headers.cookie || null, inm: req.headers['if-none-match'] || null, corpo })
      const sub = acessos.get(at)
      if (!sub || !(escoposDe.get(at) || []).includes('zro.set') || barrada()) return responder(res, 401, { error: 'unauthenticated', message: 'Token inválido, vencido ou sem permissão para esta ação.' })
      if (req.method === 'GET' && req.headers['if-none-match'] === 'W/"v1"') {
        res.writeHead(304, { etag: 'W/"v1"' })
        return res.end()
      }
      res.writeHead(200, { 'content-type': 'application/json', ...(req.method === 'GET' ? { etag: 'W/"v1"' } : {}) })
      return res.end(JSON.stringify(caminho === '' ? { eu: { id: 'eu' }, pessoas: [], naoLidas: 1, pedidos: 0 } : { ok: true }))
    }
    responder(res, 404, { error: 'not_found' })
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${server.address().port}`
  /** vencer(): todos os access tokens deixam de valer (como 10 minutos depois) */
  return { url: base, estado, vencer: () => acessos.clear(), fechar: () => new Promise((ok) => server.close(() => ok())) }
}
