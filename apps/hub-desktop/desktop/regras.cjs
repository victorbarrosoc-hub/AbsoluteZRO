// Regras de confiança do app de desktop, sem importar o Electron (os testes em test/ usam node --test).
//
// A janela mostra só o HUB (https://absolutezro.com) e, para "Entrar com o Google", a página de login do
// Google. Todo o resto (os apps SOBEDESCE, NOSSOM, Synquei, TPeasy, Carro do Freela, documentação, GitHub) abre no
// navegador padrão, e só se for https. O link absolutezro://caminho abre uma rota do HUB e nada além disso.

const HUB_PADRAO = 'https://absolutezro.com'
const ESQUEMA = 'absolutezro'

// Login do Google: só a página de contas, em https. Os redirecionamentos internos do Google (accounts.youtube.com,
// gds.google.com…) não entram; se aparecerem, vão para o navegador.
const GOOGLE_LOGIN = new Set(['accounts.google.com'])

// Caminhos do HUB que um link absolutezro:// não abre: a API e o fluxo OAuth (não fazem sentido como página e
// evitam que um link de fora dispare uma ação).
const FORA_DO_DEEP_LINK = [/^\/api(\/|$)/i, /^\/oauth(\/|$)/i, /^\/\.well-known(\/|$)/i]

/**
 * Endereço do HUB. No app instalado é sempre o oficial. Em desenvolvimento (`npm run desktop`), ZRO_HUB_URL pode
 * apontar para outro https ou para http://localhost.
 */
function hubOrigin({ empacotado, env = process.env } = {}) {
  if (empacotado) return HUB_PADRAO
  const bruto = String(env.ZRO_HUB_URL || '').trim()
  if (!bruto) return HUB_PADRAO
  try {
    const u = new URL(bruto)
    const local = u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    if ((u.protocol === 'https:' || local) && !u.username && !u.password) return u.origin
  } catch {
    // endereço inválido: fica o oficial
  }
  return HUB_PADRAO
}

function parse(url) {
  try {
    return new URL(String(url))
  } catch {
    return null
  }
}

/** A URL é do HUB (mesma origem, sem usuário/senha embutidos)? */
function ehDoHub(url, origin) {
  const u = parse(url)
  return !!u && u.origin === origin && !u.username && !u.password
}

/** A URL é a página de login do Google (https, accounts.google.com, porta padrão)? */
function ehLoginGoogle(url) {
  const u = parse(url)
  return !!u && u.protocol === 'https:' && GOOGLE_LOGIN.has(u.hostname) && !u.port && !u.username && !u.password
}

/** A janela do app pode navegar para esta URL? (só o HUB e o login do Google) */
function podeNavegar(url, origin) {
  return ehDoHub(url, origin) || ehLoginGoogle(url)
}

/**
 * Link que sai do app: devolve a URL normalizada para o navegador padrão, ou null quando não pode sair
 * (qualquer esquema que não seja https, como file:, smb:, javascript:, ou com usuário e senha embutidos).
 */
function linkExterno(url) {
  const u = parse(url)
  if (!u || u.protocol !== 'https:' || u.username || u.password || !u.hostname) return null
  return u.href
}

/** O que fazer com uma navegação ou janela nova: 'app' (fica na janela), 'fora' (navegador) ou 'nada'. */
function destino(url, origin) {
  if (podeNavegar(url, origin)) return 'app'
  if (linkExterno(url)) return 'fora'
  return 'nada'
}

// Deep link de app (ADR 0036): absolutezro://apps/<id>?acao=atualizar|instalar. Os apps da família abrem este link
// quando têm versão nova (ou para pedir a instalação de outro app); a central abre no cartão do app e já oferece a
// ação, mas só a pessoa confirma. Nada acontece sozinho a partir de um link.
const APP_ID = /^[a-z0-9-]{2,40}$/
const ACOES_DE_APP = new Set(['atualizar', 'instalar'])

/** absolutezro://apps/maestro?acao=atualizar → { id: 'maestro', acao: 'atualizar' } (acao null se faltar ou for outra). */
function linkDeApp(url) {
  const bruto = String(url || '').trim()
  if (!bruto.toLowerCase().startsWith(`${ESQUEMA}:`) || bruto.length > 512) return null
  let u
  try {
    u = new URL('https://x/' + bruto.slice(ESQUEMA.length + 1).replace(/^\/+/, ''))
  } catch {
    return null
  }
  const m = /^\/apps\/([^/]+)\/?$/.exec(u.pathname)
  if (!m || !APP_ID.test(m[1])) return null
  const acao = u.searchParams.get('acao')
  return { id: m[1], acao: ACOES_DE_APP.has(acao) ? acao : null }
}

/**
 * absolutezro://projetos/123?aba=x → https://absolutezro.com/projetos/123?aba=x
 * absolutezro://apps/<id>?acao=atualizar → https://absolutezro.com/app?app=<id>&acao=atualizar (o cartão do app)
 * Aceita também absolutezro:///projetos e absolutezro:projetos. Devolve null para o que não for rota do HUB.
 */
function deepLink(url, origin) {
  const bruto = String(url || '').trim()
  if (!bruto.toLowerCase().startsWith(`${ESQUEMA}:`)) return null
  if (bruto.length > 2048) return null
  const app = linkDeApp(bruto)
  if (app) return `${origin}/app?app=${app.id}${app.acao ? `&acao=${app.acao}` : ''}#app-${app.id}`
  // tudo depois do "absolutezro:" vira caminho; barras repetidas no começo viram uma (nada de //outro-site)
  let resto = bruto.slice(ESQUEMA.length + 1).replace(/\\/g, '/')
  resto = '/' + resto.replace(/^\/+/, '')
  if (/^\/[^/?#]*@/.test(resto)) return null // absolutezro://usuario@host
  let alvo
  try {
    alvo = new URL(resto, origin)
  } catch {
    return null
  }
  if (alvo.origin !== origin || alvo.username || alvo.password) return null
  if (FORA_DO_DEEP_LINK.some((re) => re.test(alvo.pathname))) return null
  return alvo.href
}

/** O primeiro absolutezro:// numa lista de argumentos (Windows e Linux passam o link na linha de comando). */
function deepLinkDosArgs(argv, origin) {
  for (const a of argv || []) {
    const alvo = deepLink(a, origin)
    if (alvo) return alvo
  }
  return null
}

// Downloads da central (ADR 0036): o HUB (/baixar/…) redireciona para o Release no GitHub do dono da Absolute ZRO e
// dali para o servidor de arquivos do GitHub. Nenhum outro destino, e fora do HUB só https na porta padrão.
const GITHUB_RELEASE = /^\/victorbarrosoc-hub\/[A-Za-z0-9._-]+\/releases\/download\/[^/]+\/[^/]+$/
const ARQUIVOS_DO_GITHUB = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'])

/** A central pode baixar deste endereço (ou seguir um redirecionamento para ele)? */
function downloadPermitido(url, origin) {
  const u = parse(url)
  if (!u || u.username || u.password) return false
  if (u.origin === origin) return u.pathname.startsWith('/baixar/')
  if (u.protocol !== 'https:' || u.port) return false
  if (u.hostname === 'github.com') return GITHUB_RELEASE.test(u.pathname)
  return ARQUIVOS_DO_GITHUB.has(u.hostname)
}

// Permissões que a página do HUB pode ter. Câmera, microfone, localização, notificações, MIDI, USB etc. ficam
// negados; copiar texto (botões "Copiar") e tela cheia de vídeo funcionam.
const PERMITIDAS = new Set(['clipboard-sanitized-write', 'fullscreen'])

function permitir(permissao, urlQuePede, origin) {
  return PERMITIDAS.has(permissao) && ehDoHub(urlQuePede, origin)
}

// Erros de rede do Chromium que mostram a tela "Sem conexão" (os outros, como certificado inválido, também
// mostram, mas com outro texto). https://source.chromium.org/chromium/chromium/src/+/main:net/base/net_error_list.h
const ERROS_DE_REDE = new Set([-2, -7, -21, -100, -101, -102, -103, -104, -105, -106, -109, -118, -130, -137, -324])
const ehErroDeRede = (codigo) => ERROS_DE_REDE.has(Number(codigo))

/**
 * Agente de usuário sem o "Electron/x" e o nome do app: o login do Google recusa navegadores que se identificam
 * como embutidos. A página sabe que está no app pelo window.zroDesktop (preload), não pelo agente.
 */
function agenteLimpo(ua) {
  return String(ua || '')
    .replace(/\s?Electron\/\S+/g, '')
    .replace(/\s?absolute-zro-desktop\/\S+/gi, '')
    .replace(/\s?Absolute ZRO\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

module.exports = {
  HUB_PADRAO,
  ESQUEMA,
  hubOrigin,
  ehDoHub,
  ehLoginGoogle,
  podeNavegar,
  linkExterno,
  destino,
  deepLink,
  linkDeApp,
  deepLinkDosArgs,
  downloadPermitido,
  permitir,
  ehErroDeRede,
  agenteLimpo,
}
