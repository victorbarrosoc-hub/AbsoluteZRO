// Regras de confiança do RADION para computador, sem importar o Electron (os testes em test/ usam node --test).
//
// A janela mostra o RADION (https://radion.absolutezro.com) e, para o login único, só as telas de entrar da Absolute ZRO
// (https://absolutezro.com: /oauth/authorize, /entrar, /criar-conta…). O Google fica de fora: recusa OAuth em janela embutida (disallowed_useragent), então
// "Entrar com o Google" roda no navegador do sistema e o app volta por deep link (login-externo.cjs, ADR 0041). O resto do HUB e qualquer outro site abrem no navegador padrão, e só se forem https. E-mail
// (mailto:) vai para o app de e-mail. O link radion://caminho abre uma rota do RADION e nada além disso.

const RADION_PADRAO = 'https://radion.absolutezro.com'
const HUB_PADRAO = 'https://absolutezro.com'
const ESQUEMA = 'radion'

// Telas do login único da Absolute ZRO que ficam na janela (o resto do HUB vai para o navegador).
const LOGIN_DO_HUB = [
  /^\/oauth\/authorize\/?$/,
  /^\/entrar(\/|$)/,
  /^\/criar-conta\/?$/,
  /^\/esqueci-a-senha\/?$/,
  /^\/redefinir-senha\/?$/,
  /^\/confirmar-email\/?$/,
  /^\/boas-vindas\/?$/,
  /^\/em-desenvolvimento\/?$/,
]

// Caminhos que um link radion:// não abre: a API e o retorno do login (evita que um link de fora dispare uma ação).
// `entrar-app` é o retorno do login pelo navegador (código de uso único): quem trata é login-externo.cjs, nunca uma página.
const FORA_DO_DEEP_LINK = [/^\/api(\/|$)/i, /^\/\.well-known(\/|$)/i, /^\/entrar-app(\/|$)/i]

/** https, ou http só no próprio computador (desenvolvimento), sem usuário/senha: devolve a origem ou null. */
function origemAceita(bruto) {
  try {
    const u = new URL(String(bruto || '').trim())
    const local = u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    if ((u.protocol === 'https:' || local) && !u.username && !u.password) return u.origin
  } catch {
    // endereço inválido
  }
  return null
}

/**
 * Endereços do RADION e da Absolute ZRO. No app instalado são sempre os oficiais. Em desenvolvimento
 * (`npm run desktop`), RADION_URL e ZRO_HUB_URL podem apontar para outro https ou para http://localhost.
 */
function origens({ empacotado, env = process.env } = {}) {
  if (empacotado) return { radion: RADION_PADRAO, hub: HUB_PADRAO }
  return {
    radion: (env.RADION_URL && origemAceita(env.RADION_URL)) || RADION_PADRAO,
    hub: (env.ZRO_HUB_URL && origemAceita(env.ZRO_HUB_URL)) || HUB_PADRAO,
  }
}

function parse(url) {
  try {
    return new URL(String(url))
  } catch {
    return null
  }
}

const mesmaOrigem = (u, origem) => !!u && u.origin === origem && !u.username && !u.password

/** A URL é do app (mesma origem, sem usuário/senha embutidos)? */
function ehDoApp(url, o) {
  return mesmaOrigem(parse(url), o.radion)
}

/** Tela do login único da Absolute ZRO? */
function ehLoginDoHub(url, o) {
  const u = parse(url)
  return mesmaOrigem(u, o.hub) && LOGIN_DO_HUB.some((re) => re.test(u.pathname))
}

/** A janela do app pode navegar para esta URL? */
function podeNavegar(url, o) {
  if (ehDoApp(url, o)) return true
  return ehLoginDoHub(url, o)
}

/**
 * Link que sai do app: devolve a URL normalizada para o sistema, ou null quando não pode sair. https (navegador),
 * mailto: (e-mail). Nada de file:, smb:, javascript:…
 */
function linkExterno(url, _o) {
  const u = parse(url)
  if (!u || u.username || u.password) return null
  if (u.protocol === 'https:') return u.hostname ? u.href : null
  if (u.protocol === 'mailto:') return /^[^\s<>"]{3,320}$/.test(u.href.slice(7).split('?')[0]) ? u.href : null
  return null
}

/** O que fazer com uma navegação ou janela nova: 'app' (fica na janela), 'fora' (navegador/sistema) ou 'nada'. */
function destino(url, o) {
  if (podeNavegar(url, o)) return 'app'
  if (linkExterno(url, o)) return 'fora'
  return 'nada'
}

/**
 * radion://d/ABC234 → https://radion.absolutezro.com/?d=ABC234 (a diária pelo código); radion://sobre →
 * https://radion.absolutezro.com/sobre. Aceita também radion:///sobre e radion:sobre. Devolve null para o que não for
 * rota do RADION (e para a API).
 */
function deepLink(url, o) {
  const bruto = String(url || '').trim()
  if (!bruto.toLowerCase().startsWith(`${ESQUEMA}:`)) return null
  if (bruto.length > 2048) return null
  let resto = bruto.slice(ESQUEMA.length + 1).replace(/\\/g, '/')
  resto = '/' + resto.replace(/^\/+/, '')
  // radion://d/ABC234: a diária pelo código (o mesmo do QR) abre o rádio nela
  const diaria = /^\/d\/([A-Za-z0-9]{6})\/?$/.exec(resto)
  if (diaria) return `${o.radion}/?d=${diaria[1].toUpperCase()}`
  if (/^\/[^/?#]*@/.test(resto)) return null // radion://usuario@host
  let alvo
  try {
    alvo = new URL(resto, o.radion)
  } catch {
    return null
  }
  if (alvo.origin !== o.radion || alvo.username || alvo.password) return null
  if (FORA_DO_DEEP_LINK.some((re) => re.test(alvo.pathname))) return null
  return alvo.href
}

/** O primeiro radion:// numa lista de argumentos (Windows e Linux passam o link na linha de comando). */
function deepLinkDosArgs(argv, o) {
  for (const a of argv || []) {
    const alvo = deepLink(a, o)
    if (alvo) return alvo
  }
  return null
}

// Permissões que a página do RADION pode ter: o microfone (é o rádio; só áudio), copiar o link da diária, tela cheia e
// manter a tela ligada. Câmera, tela, localização, notificações da página (os avisos do set saem como notificação do
// sistema, pela ponte), MIDI, USB etc. ficam negados. O HUB e o Google não pedem nada.
const PERMITIDAS = new Set(['clipboard-sanitized-write', 'fullscreen', 'screen-wake-lock'])

/**
 * `detalhes`: o que o Electron passa ao pedido (`mediaTypes`: ['audio'] …) ou à consulta (`mediaType`: 'audio' …).
 * 'media' só passa quando é só áudio: pedido com câmera (ou sem dizer o quê) é negado.
 */
function permitir(permissao, urlQuePede, o, detalhes) {
  if (!ehDoApp(urlQuePede, o)) return false
  if (permissao === 'media') {
    const tipos = detalhes && Array.isArray(detalhes.mediaTypes) ? detalhes.mediaTypes : detalhes && detalhes.mediaType ? [detalhes.mediaType] : []
    return tipos.length > 0 && tipos.every((t) => t === 'audio')
  }
  return PERMITIDAS.has(permissao)
}

// Erros de rede do Chromium que mostram a tela "Sem conexão" (os outros mostram "O RADION não respondeu").
const ERROS_DE_REDE = new Set([-2, -7, -21, -100, -101, -102, -103, -104, -105, -106, -109, -118, -130, -137, -324])
const ehErroDeRede = (codigo) => ERROS_DE_REDE.has(Number(codigo))

module.exports = {
  RADION_PADRAO,
  HUB_PADRAO,
  ESQUEMA,
  origens,
  ehDoApp,
  ehLoginDoHub,
  podeNavegar,
  linkExterno,
  destino,
  deepLink,
  deepLinkDosArgs,
  permitir,
  ehErroDeRede,
}
