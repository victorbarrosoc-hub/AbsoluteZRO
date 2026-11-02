// Entrar com o Google pelo navegador do sistema (ADR 0041), sem importar o Electron (testado com node --test).
//
// O Google recusa OAuth dentro de janela embutida (disallowed_useragent), então a janela do app nunca abre
// accounts.google.com. Quando ela tenta (o botão "Continuar com o Google" do HUB, em /entrar/google, ou um redirecionamento
// para o Google), o app cancela a navegação e segue o padrão RFC 8252 com PKCE:
//   1. guarda um pedido na memória (state + verifier) e abre `<HUB>/entrar/app?app=…&state=…&challenge=…&next=…` no
//      navegador do sistema;
//   2. a pessoa entra lá (Google, e-mail e senha) e toca em "Voltar para o app";
//   3. o HUB abre `<esquema>://entrar-app?code=…&state=…` (código de uso único, 60 s);
//   4. o app confere o state, troca o código + verifier por uma sessão do HUB (POST <HUB>/entrar/app/trocar, o cookie vai
//      para o jar da própria janela) e carrega o destino de volta na janela.
// Entrar com e-mail e senha continua dentro da janela. Cópia idêntica em cada app (scripts/compartilhado.mjs).

const cripto = require('node:crypto')

const ROTA = 'entrar-app'
const VALIDADE_DO_PEDIDO_MS = 10 * 60_000
const STATE = /^[A-Za-z0-9_-]{16,128}$/
const CODIGO = /^zd_[A-Za-z0-9_-]{43}$/

const parse = (url) => {
  try {
    return new URL(String(url))
  } catch {
    return null
  }
}

/** Caminho do próprio HUB: começa com uma barra, nunca //host, /\host nem caractere de controle. */
function caminhoSeguro(n) {
  if (typeof n !== 'string' || !n || n.length > 2000 || !n.startsWith('/') || n.startsWith('//') || n.includes('\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(n)) return null
  return n
}

/** Página de login do Google (https, accounts.google.com, porta padrão, sem usuário/senha). */
function ehGoogle(url) {
  const u = parse(url)
  return !!u && u.protocol === 'https:' && u.hostname === 'accounts.google.com' && !u.port && !u.username && !u.password
}

/**
 * Esta navegação abriria o login do Google? accounts.google.com (qualquer caminho) ou a rota do HUB que leva a ele
 * (/entrar/google; o /entrar/google/retorno é a volta, que só acontece no navegador do sistema).
 */
function ehEntradaGoogle(url, hub) {
  if (ehGoogle(url)) return true
  const u = parse(url)
  return !!u && u.origin === hub && !u.username && !u.password && /^\/entrar\/google\/?$/.test(u.pathname)
}

/**
 * Para onde voltar na janela depois de entrar: o `next` do botão do Google, o `next` da tela de entrar onde a pessoa
 * estava, ou a última página do HUB (sem as telas de entrar). null = o início do app.
 */
function destinoDepoisDeEntrar(urlInterceptada, ultimaUrl, hub) {
  const doHub = (url) => {
    const u = parse(url)
    return u && u.origin === hub && !u.username && !u.password ? u : null
  }
  for (const url of [urlInterceptada, ultimaUrl]) {
    const u = doHub(url)
    if (!u) continue
    const next = caminhoSeguro(u.searchParams.get('next'))
    if (/^\/(entrar|criar-conta)(\/|$)/.test(u.pathname)) {
      if (next) return next
      continue
    }
    return caminhoSeguro(u.pathname + u.search)
  }
  return null
}

function sha256url(s) {
  return cripto.createHash('sha256').update(s, 'utf8').digest('base64url')
}

/** Pedido novo: state e verifier aleatórios (só ficam na memória do app) e o desafio S256. */
function novoPedido({ app, next, agora = Date.now(), aleatorio = cripto.randomBytes }) {
  const state = aleatorio(24).toString('base64url')
  const verifier = aleatorio(32).toString('base64url')
  return { app, state, verifier, challenge: sha256url(verifier), next: caminhoSeguro(next), criadoEm: agora }
}

/** O endereço que abre no navegador do sistema. */
function urlDeInicio(hub, pedido) {
  const u = new URL(`${hub}/entrar/app`)
  u.searchParams.set('app', pedido.app)
  u.searchParams.set('state', pedido.state)
  u.searchParams.set('challenge', pedido.challenge)
  if (pedido.next) u.searchParams.set('next', pedido.next)
  return u.href
}

/** É um link de retorno deste app (`<esquema>://entrar-app…`), válido ou não? Não pode virar rota do app. */
function ehRetorno(url, esquema) {
  const u = parse(url)
  return !!u && u.protocol === `${esquema}:` && u.hostname === ROTA
}

/** `<esquema>://entrar-app?code=…&state=…` → { code, state }, ou null se faltar ou vier fora do formato. */
function lerRetorno(url, esquema) {
  const bruto = String(url || '')
  if (bruto.length > 512 || !ehRetorno(bruto, esquema)) return null
  const u = parse(bruto)
  if (u.username || u.password || (u.pathname !== '' && u.pathname !== '/')) return null
  const code = u.searchParams.get('code')
  const state = u.searchParams.get('state')
  if (!code || !state || !CODIGO.test(code) || !STATE.test(state)) return null
  return { code, state }
}

/** O primeiro link de retorno numa lista de argumentos (Windows e Linux passam o link na linha de comando). */
function retornoDosArgs(argv, esquema) {
  for (const a of argv || []) if (ehRetorno(a, esquema)) return a
  return null
}

const igual = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && cripto.timingSafeEqual(x, y)
}

/**
 * Orquestra o fluxo. Tudo que toca o Electron entra por `dep`:
 *   hub, esquema, inicio (URL de abertura do app), ultimaUrl() → URL, abrirNoNavegador(url), fetch(url, init),
 *   carregar(url) na janela, focar(), avisar(texto), agora().
 */
function criarLoginExterno(dep) {
  const agora = dep.agora || Date.now
  let pedido = null

  return {
    ehEntradaGoogle: (url) => ehEntradaGoogle(url, dep.hub),
    ehRetorno: (url) => ehRetorno(url, dep.esquema),
    retornoDosArgs: (argv) => retornoDosArgs(argv, dep.esquema),
    pedidoAtual: () => pedido,

    /** A janela tentou abrir o Google: cancela lá e abre o HUB no navegador do sistema. */
    iniciar(urlInterceptada) {
      const ultima = dep.ultimaUrl ? dep.ultimaUrl() : null
      pedido = novoPedido({ app: dep.esquema, next: destinoDepoisDeEntrar(urlInterceptada, ultima, dep.hub), agora: agora() })
      dep.abrirNoNavegador(urlDeInicio(dep.hub, pedido))
      return pedido
    },

    /**
     * Chegou um link do sistema. Devolve 'ignorado' (não é do login), 'invalido' (formato, state errado ou pedido
     * velho: nada é trocado), 'entrou' ou 'falhou'.
     */
    async tratarLink(url) {
      if (!ehRetorno(url, dep.esquema)) return 'ignorado'
      const r = lerRetorno(url, dep.esquema)
      const p = pedido
      if (!r || !p) return 'invalido'
      if (agora() - p.criadoEm > VALIDADE_DO_PEDIDO_MS) {
        pedido = null
        return 'invalido'
      }
      // state errado: pode ser um link de fora tentando se passar pelo retorno; o pedido de verdade continua valendo
      if (!igual(r.state, p.state)) return 'invalido'
      pedido = null
      try {
        const res = await dep.fetch(`${dep.hub}/entrar/app/trocar`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ app: p.app, code: r.code, state: r.state, verifier: p.verifier }),
          credentials: 'include',
        })
        const j = await res.json().catch(() => null)
        if (!res.ok || !j || j.ok !== true) throw new Error(`troca recusada (${res.status})`)
        const caminho = caminhoSeguro(j.next) || p.next
        const alvo = caminho ? parse(dep.hub + caminho) : null
        dep.carregar(alvo && alvo.origin === dep.hub ? alvo.href : dep.inicio)
        if (dep.focar) dep.focar()
        return 'entrou'
      } catch {
        if (dep.avisar) dep.avisar('Não deu para entrar com o Google. Tente de novo.')
        return 'falhou'
      }
    },
  }
}

module.exports = {
  ROTA,
  VALIDADE_DO_PEDIDO_MS,
  caminhoSeguro,
  ehGoogle,
  ehEntradaGoogle,
  destinoDepoisDeEntrar,
  novoPedido,
  urlDeInicio,
  ehRetorno,
  lerRetorno,
  retornoDosArgs,
  criarLoginExterno,
}
