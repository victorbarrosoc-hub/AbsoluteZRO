// O link do visitante de um evento (`/e/<token>`): quem abre não tem conta. Mesmo desenho do link da galeria
// (api/_link.js): tudo passa pela porta estreita do banco (db/migrations/0003 e 0004, `foto.evento_*`, security
// definer); a transação assume `foto_app` sem pessoa, o RLS esconde todas as tabelas e só as funções respondem, e só
// sobre o evento do token. O token é de 32 bytes (o banco guarda o sha256); PIN opcional por scrypt, com a mesma prova
// em cookie.
//
// A selfie nunca chega aqui: só os 1 a 3 vetores int8 (128 bytes cada, em base64), que vão como argumento da função e
// somem com a transação. Nada deste arquivo escreve vetor em log, em limite ou em erro.
//
// Busca em camadas (docs/estudo/rosto-em-evento.md, B.5; num evento todo mundo sai pelo mesmo Wi-Fi):
//   aparelho  um identificador sorteado no próprio aparelho (cookie `foto_ap`, HttpOnly, assinado com HMAC; no banco
//             só entra um HMAC dele com o link, que não liga um evento a outro): 5 buscas a cada 10 minutos, 30 por dia;
//   rede      por IP (HMAC do dia; o IP nunca é guardado): 900 a cada 10 minutos, pensado para um salão inteiro;
//   evento    por link: 3.000 por hora, teto contra varredura automatizada;
//   prova     toda busca (achar, cadastrar, remover) leva uma prova de captura ao vivo emitida aqui para AQUELE aparelho,
//             de uso único: o servidor sorteia o desafio (`desafio`), o celular cumpre e manda os pontos do detector
//             quadro a quadro (`prova`), o servidor confere (src/rosto/vida.js) e devolve a prova, presa ao aparelho, ao
//             link e aos vetores daquela captura. Trocar de cookie não ajuda: aparelho novo não tem prova.
// O que isto não segura (cliente modificado que fabrica pontos, vídeo de quem gira a cabeça) está em vida.js.
// Link desconhecido, revogado, vencido ou de evento que não está publicado: a mesma resposta ("morto").

import { createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { armazenamento, apagarArquivos, chavesDe } from './_arquivos.js'
import { banco } from './_banco.js'
import { comoLink, ehToken, hashToken, ipDe, ipHashDoDia, nomeCookiePin, pinConfere, prova, PROVA_S, provaConfere, UUID } from './_link.js'
import { consumir, dentroDoLimite, registrarTentativa } from './_limite.js'
import { lerCookie } from './_zro.js'
import { vetorDeTexto } from '../src/rosto/assinatura.js'
import { PELA_VERSAO, TEXTOS, textoDoRegistro } from '../src/rosto/textos.js'
import { conferirVida, sortearPassos, VIDA } from '../src/rosto/vida.js'

export const REGRAS_EVENTO = {
  /** Qualquer pedido de link de evento (menos imagem) por IP: 6.000 por hora. Um salão de 300 convidados faz ~10
   *  pedidos cada (abrir, desafio, prova, busca, voltar, pedir); varrer tokens segue sem compensar (mortoIp). */
  ip: { max: 6000, janelaS: 3600 },
  /** Link que não existe: 30 por hora por IP (a mesma conta do link da galeria). */
  mortoIp: { max: 30, janelaS: 3600 },
  /** Abrir: 3.000 por hora por link (evento grande, muita gente ao mesmo tempo). */
  abrir: { max: 3000, janelaS: 3600 },
  /** PIN errado: 5 a cada 15 minutos por link e IP; 60 por link. */
  pinIp: { max: 5, janelaS: 900 },
  pin: { max: 60, janelaS: 900 },
  /** Busca, pedido de busca e remoção. Aparelho: 5 a cada 10 minutos e 30 por dia. Rede (IP): 900 a cada 10 minutos
   *  (300 convidados no mesmo Wi-Fi × 3 tentativas: a busca, outra com mais luz e a remoção, todas na janela em que o
   *  cartaz é mostrado) e 6.000 por dia. Evento (link): 3.000 por hora, o teto contra varredura. */
  buscaAparelho: { max: 5, janelaS: 600 },
  buscaAparelhoDia: { max: 30, janelaS: 86400 },
  buscaIp: { max: 900, janelaS: 600 },
  buscaIpDia: { max: 6000, janelaS: 86400 },
  busca: { max: 3000, janelaS: 3600 },
  /** Desafio de vida: 12 a cada 10 minutos por aparelho (cada busca gasta um; quem erra tenta de novo), 1.800 por IP,
   *  6.000 por hora por link. Cada desafio vale uma prova só. */
  desafioAparelho: { max: 12, janelaS: 600 },
  desafioIp: { max: 1800, janelaS: 600 },
  desafio: { max: 6000, janelaS: 3600 },
  /** Voltar e ver as minhas: 120 por hora por link e IP. Pedir fotos: 10 por hora por link e IP. */
  minhasIp: { max: 120, janelaS: 3600 },
  pedirIp: { max: 10, janelaS: 3600 },
  /** Imagens: 40.000 por hora por link e 15.000 por IP (300 convidados × ~50 miniaturas e prévias). */
  imagem: { max: 40000, janelaS: 3600 },
  imagemIp: { max: 15000, janelaS: 3600 },
}
const UMA_VEZ = { max: 1, janelaS: 86400 }

export const CHAVE_PESSOA = /^[A-Za-z0-9_-]{43}$/
export const sha256 = (t) => createHash('sha256').update(t).digest('hex')

/** A versão do texto que a página mostrou, conferida: { versao, sha } ou null (versão que não existe ou de outro tipo). */
export function textoAceito(versao, ...tipos) {
  const chave = PELA_VERSAO[versao]
  if (!chave || !tipos.includes(chave)) return null
  return { versao, sha: sha256(textoDoRegistro(chave)) }
}

/** 1 a 3 vetores em base64, conferidos (128 bytes int8 bem-formados): a mesma lista, ou null. */
export function sondasDe(lista) {
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > 3) return null
  return lista.every((t) => vetorDeTexto(t)) ? lista.slice() : null
}

/** As sondas como bytea[] no banco (decodificadas lá; o vetor não é guardado nem escrito em log). */
const comoBytea = (tx, s) => tx`(select array_agg(decode(x, 'base64') order by o) from unnest(${s}::text[]) with ordinality as t(x, o))`

const pinDoEvento = async (tx, th) => (await tx`select foto.evento_pin(${th}) as r`)[0]?.r ?? null
const nomeCookie = (token) => nomeCookiePin(token).replace('foto_pin_', 'foto_epin_')
const pinOkDe = (req, token, pin) => !pin.pin || provaConfere(lerCookie(req, nomeCookie(token)), pin.link, pin.versao)

/** Consome todas as chaves de uma vez; se não couber, diz qual camada estourou: null (coube) ou o escopo. */
async function consumirEmCamadas(lista) {
  if (!lista.length || (await consumir(lista.map(([c, r]) => [c, r])))) return null
  for (const [c, r, escopo] of lista) if (!(await dentroDoLimite([[c, r]]))) return escopo ?? 'evento'
  return 'evento'
}

/**
 * Antes de tudo: limites do IP, forma do token, limites da ação, link vivo, prova do PIN; depois `fn(tx, th, pinOk)` na
 * transação da porta. { estado: 'limite', escopo? } | { estado: 'morto' } | { estado: 'ok', r }.
 * `limites`: [[chave, regra]] a mais, conferidos (por link, por link e IP). `exige(th, ipHash)`: com o link vivo e o PIN
 * certo, antes de contar: { erro } para parar ou { consome: [[chave, regra, escopo]] } a mais (a prova de uso único).
 * `consome(th, ipHash)`: [[chave, regra, escopo]] que contam ANTES de rodar (a busca). Escopo 'prova' que não cabe
 * vira { erro: 'prova' } (prova já usada), os outros viram 'limite' com o escopo.
 */
export async function pelaPortaDoEvento(req, token, { limites = () => [], consome = () => [], exige = null, ip = null } = {}, fn) {
  const ipHash = ipHashDoDia(ipDe(req))
  const doIp = [
    [ip ? `${ip.prefixo}:${ipHash}` : `evento-ip:${ipHash}`, ip ? ip.regra : REGRAS_EVENTO.ip],
    [`link-morto:${ipHash}`, REGRAS_EVENTO.mortoIp],
  ]
  if (!ehToken(token)) {
    if (!(await dentroDoLimite(doIp))) return { estado: 'limite' }
    await registrarTentativa(doIp[0][0], `link-morto:${ipHash}`)
    return { estado: 'morto' }
  }
  const th = hashToken(token)
  const extras = limites(th, ipHash)
  if (!(await dentroDoLimite([...doIp, ...extras]))) return { estado: 'limite', escopo: 'rede' }
  const saida = await comoLink(async (tx) => {
    const pin = await pinDoEvento(tx, th)
    if (!pin) return null
    return { pin, pinOk: pinOkDe(req, token, pin) }
  })
  if (!saida) {
    await registrarTentativa(doIp[0][0], `link-morto:${ipHash}`)
    return { estado: 'morto' }
  }
  // o que conta antes (a busca) só conta com o link vivo e a prova do PIN: tentativa sem PIN não gasta a vez de ninguém
  if (saida.pinOk) {
    const pede = exige ? await exige(th, ipHash) : null
    if (pede?.erro) {
      await registrarTentativa(doIp[0][0], ...extras.map(([c]) => c))
      return { estado: 'ok', r: pede }
    }
    const estourou = await consumirEmCamadas([...consome(th, ipHash), ...(pede?.consome ?? [])])
    if (estourou === 'prova') return { estado: 'ok', r: { erro: 'prova' } }
    if (estourou) return { estado: 'limite', escopo: estourou }
  }
  const r = await comoLink(async (tx) => fn(tx, th, saida.pinOk))
  await registrarTentativa(doIp[0][0], ...extras.map(([c]) => c))
  return { estado: 'ok', r }
}

/** O link está vivo? Para servir a página: 'ok' | 'morto' | 'limite'. */
export async function eventoVivo(req, token) {
  return (await pelaPortaDoEvento(req, token, {}, async () => true)).estado
}

/** Confere o PIN. { ok: true, cookie } ou { ok: false, erro: 'morto' | 'limite' | 'pin' }. */
export async function conferirPinDoEvento(req, token, pinDigitado) {
  const ipHash = ipHashDoDia(ipDe(req))
  const doIp = [
    [`evento-ip:${ipHash}`, REGRAS_EVENTO.ip],
    [`link-morto:${ipHash}`, REGRAS_EVENTO.mortoIp],
  ]
  if (!(await dentroDoLimite(doIp))) return { ok: false, erro: 'limite' }
  if (!ehToken(token)) {
    await registrarTentativa(`evento-ip:${ipHash}`, `link-morto:${ipHash}`)
    return { ok: false, erro: 'morto' }
  }
  const th = hashToken(token)
  const pin = await comoLink((tx) => pinDoEvento(tx, th))
  if (!pin) {
    await registrarTentativa(`evento-ip:${ipHash}`, `link-morto:${ipHash}`)
    return { ok: false, erro: 'morto' }
  }
  const chaveIp = `evento-pin:${th}:${ipHash}`
  const chaveLink = `evento-pin:${th}`
  if (
    !(await dentroDoLimite([
      [chaveIp, REGRAS_EVENTO.pinIp],
      [chaveLink, REGRAS_EVENTO.pin],
    ]))
  )
    return { ok: false, erro: 'limite' }
  if (pin.pin && !pinConfere(String(pinDigitado ?? '').trim(), pin.pin)) {
    await registrarTentativa(chaveIp, chaveLink, `evento-ip:${ipHash}`)
    return { ok: false, erro: 'pin' }
  }
  await registrarTentativa(`evento-ip:${ipHash}`)
  return { ok: true, cookie: { nome: nomeCookie(token), valor: prova(pin.link, pin.versao, Date.now() + PROVA_S * 1000), maxAge: PROVA_S } }
}

/** O que a porta devolveu vira { ok: true, … } ou { ok: false, erro }. */
export function resultado(p) {
  if (p.estado === 'limite') return { ok: false, erro: 'limite', escopo: p.escopo ?? 'rede' }
  if (p.estado === 'morto' || !p.r) return { ok: false, erro: 'link' }
  if (p.r.erro) return { ok: false, ...p.r }
  return p.r
}

// ───────── o aparelho e a prova de vida ─────────

const g = globalThis
// a mesma origem da chave do link (api/_link.js): ZRO_CLIENT_SECRET; no modo local, a chave sorteada por processo
const segredo = () => (process.env.ZRO_CLIENT_SECRET || '').trim() || (g.__fotoLinkSegredo ??= randomBytes(32).toString('hex'))
const chave = (uso) => Buffer.from(hkdfSync('sha256', Buffer.from(segredo(), 'utf8'), Buffer.from('foto-evento', 'utf8'), Buffer.from(uso, 'utf8'), 32))
const assinar = (texto, uso) => createHmac('sha256', chave(uso)).update(texto).digest('base64url').slice(0, 32)
const igual = (a, b) => {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && timingSafeEqual(x, y)
}

export const COOKIE_APARELHO = 'foto_ap'
export const APARELHO_S = 30 * 86400
const ID_APARELHO = /^[A-Za-z0-9_-]{22}$/
const NONCE = /^[A-Za-z0-9_-]{16}$/
const PARA = ['busca', 'cadastro', 'remocao']
/** Quanto a prova vale depois de emitida: 3 minutos para buscar; 15 para a remoção (a pessoa confere as fotos). */
export const PROVA_VALE_MS = { busca: 180000, cadastro: 180000, remocao: 900000 }

/** Um aparelho novo: 16 bytes sorteados + HMAC. O valor do cookie. */
export function novoAparelho() {
  const id = randomBytes(16).toString('base64url')
  return `${id}.${assinar(id, 'aparelho')}`
}
/** O id do aparelho do cookie, conferido; null sem cookie ou com cookie adulterado. */
export function aparelhoDe(req) {
  const [id, sig] = String(lerCookie(req, COOKIE_APARELHO) ?? '').split('.')
  return ID_APARELHO.test(id ?? '') && igual(sig, assinar(id, 'aparelho')) ? id : null
}
export const idDoAparelho = (valor) => String(valor).split('.')[0]
export const cookieDoAparelho = (valor, seguro) => `${COOKIE_APARELHO}=${valor}; Path=/; Max-Age=${APARELHO_S}; HttpOnly${seguro ? '; Secure' : ''}; SameSite=Lax`
/** O aparelho visto por um link: HMAC(id, link). É o que entra nas chaves de limite (não liga um evento a outro). */
const marcaDe = (aparelho, th) => assinar(`${aparelho}|${th}`, 'aparelho-link')
const shaDosVetores = (s) => createHash('sha256').update(s.join(',')).digest('base64url')

/** A prova (uso único, presa ao link, ao aparelho e aos vetores): "<nonce>.<para>.<até>.<hmac>". */
const selarProva = (th, marca, nonce, para, ate, sha) => `${nonce}.${para}.${ate}.${assinar(`${th}|${marca}|${nonce}|${para}|${ate}|${sha}`, 'prova')}`
function abrirProva(th, marca, texto, para, sha) {
  const [nonce, p, ate, sig] = String(texto ?? '').split('.')
  if (!NONCE.test(nonce ?? '') || p !== para || !(Number(ate) > Date.now())) return null
  return igual(sig, assinar(`${th}|${marca}|${nonce}|${p}|${ate}|${sha}`, 'prova')) ? nonce : null
}
/** "Lembrar neste aparelho" (busca aberta): os vetores daquela captura, de novo, só neste aparelho e neste link. */
const LEMBRAR_MS = 30 * 86400000
const selarLembranca = (th, marca, sha, ate) => `${ate}.${assinar(`${th}|${marca}|lembrar|${ate}|${sha}`, 'lembrar')}`
function lembrancaConfere(th, marca, texto, sha) {
  const [ate, sig] = String(texto ?? '').split('.')
  return Number(ate) > Date.now() && igual(sig, assinar(`${th}|${marca}|lembrar|${ate}|${sha}`, 'lembrar'))
}

const camadasDaBusca = (aparelho) => (th, ipHash) => {
  const m = marcaDe(aparelho, th)
  return [
    [`evento-busca-ap:${th}:${m}`, REGRAS_EVENTO.buscaAparelho, 'aparelho'],
    [`evento-busca-ap-dia:${th}:${m}`, REGRAS_EVENTO.buscaAparelhoDia, 'aparelho'],
    [`evento-busca-ip:${th}:${ipHash}`, REGRAS_EVENTO.buscaIp, 'rede'],
    [`evento-busca-ip-dia:${th}:${ipHash}`, REGRAS_EVENTO.buscaIpDia, 'rede'],
    [`evento-busca:${th}`, REGRAS_EVENTO.busca, 'evento'],
  ]
}

/** A prova da captura: confere e diz o que gastar (o nonce, uma vez por uso). Sem aparelho, sem prova. */
const exigeProva = (aparelho, texto, para, uso, s, { lembranca = null } = {}) => async (th) => {
  if (!aparelho) return { erro: 'prova' }
  const m = marcaDe(aparelho, th)
  const sha = shaDosVetores(s)
  const nonce = abrirProva(th, m, texto, para, sha)
  if (nonce) return { consome: [[`evento-prova:${nonce}:${uso}`, UMA_VEZ, 'prova']], prova: true }
  if (lembranca && lembrancaConfere(th, m, lembranca, sha)) return { consome: [] }
  return { erro: 'prova' }
}

/** O desafio de vida: a ordem dos passos sorteada, presa ao link e ao aparelho, com hora (o prazo conta daqui). */
export async function emitirDesafio(req, token, aparelho) {
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      {
        consome: (th, ipHash) => [
          [`evento-desafio-ap:${th}:${marcaDe(aparelho, th)}`, REGRAS_EVENTO.desafioAparelho, 'aparelho'],
          [`evento-desafio-ip:${ipHash}`, REGRAS_EVENTO.desafioIp, 'rede'],
          [`evento-desafio:${th}`, REGRAS_EVENTO.desafio, 'evento'],
        ],
      },
      async (tx, th, pinOk) => {
        if (!pinOk) return { erro: 'pin' }
        const id = randomBytes(12).toString('base64url')
        const passos = sortearPassos(() => randomInt(0, 2 ** 30) / 2 ** 30)
        const em = Date.now()
        const selo = assinar(`${th}|${marcaDe(aparelho, th)}|${id}|${passos.join(',')}|${em}`, 'desafio')
        return { ok: true, desafio: { id, passos, em, selo }, prazoMs: VIDA.prazoMs }
      },
    ),
  )
}

/**
 * Confere a captura ao vivo do desafio e emite a prova de uso único. `corpo`: { desafio, quadros, vetores, para }.
 * { ok, prova, ate } ou { ok: false, erro: 'vida', motivo } (o motivo é para a tela, não tem nada da pessoa).
 */
export async function provarVida(req, token, aparelho, { desafio, quadros, vetores, para }) {
  const s = sondasDe(vetores)
  if (!s) return { ok: false, erro: 'vetor' }
  if (!aparelho) return { ok: false, erro: 'prova' }
  if (!PARA.includes(para) || !desafio || typeof desafio !== 'object' || !NONCE.test(String(desafio.id)) || !Array.isArray(desafio.passos))
    return { ok: false, erro: 'formato' }
  const { id, passos, em, selo } = desafio
  const p = await pelaPortaDoEvento(
    req,
    token,
    {
      exige: async (th) => {
        const m = marcaDe(aparelho, th)
        if (!Number.isFinite(em) || !igual(selo, assinar(`${th}|${m}|${id}|${passos.join(',')}|${em}`, 'desafio'))) return { erro: 'desafio' }
        // o prazo do celular conta de quando ele recebeu o desafio; aqui, de quando saiu: 5 s de folga para a rede
        const decorrido = Date.now() - em
        const conferido =
          decorrido > VIDA.prazoMs + 5000 ? { ok: false, motivo: 'prazo' } : conferirVida({ passos, quadros, decorridoMs: Math.min(decorrido, VIDA.prazoMs) })
        if (!conferido.ok) return { erro: 'vida', motivo: conferido.motivo }
        // o desafio vale uma prova só
        return { consome: [[`evento-desafio-usado:${id}`, UMA_VEZ, 'prova']] }
      },
    },
    async (tx, th, pinOk) => {
      if (!pinOk) return { erro: 'pin' }
      const ate = Date.now() + PROVA_VALE_MS[para]
      return { ok: true, prova: selarProva(th, marcaDe(aparelho, th), id, para, ate, shaDosVetores(s)), ate }
    },
  )
  return resultado(p)
}

// ───────── as ações do visitante ─────────

const porLink = (prefixo, regra) => (th) => [[`${prefixo}:${th}`, regra]]

export async function abrirEvento(req, token, { contar = false } = {}) {
  const p = await pelaPortaDoEvento(
    req,
    token,
    { limites: porLink('evento-abrir', REGRAS_EVENTO.abrir) },
    async (tx, th, pinOk) => (await tx`select foto.evento_abrir(${th}, ${pinOk}, ${contar}) as r`)[0].r,
  )
  if (p.estado !== 'ok') return p
  if (!p.r) return { estado: 'morto' }
  if (p.r.estado === 'pin') return { estado: 'pin' }
  return { estado: 'ok', evento: p.r.evento }
}

export async function recusar(req, token, tipo, versao) {
  const t = textoAceito(versao, tipo, ...(tipo === 'cadastro' ? ['cadastroCriancas'] : []))
  if (!['busca', 'cadastro', 'remocao'].includes(tipo) || !t) return { ok: false, erro: 'formato' }
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { limites: porLink('evento-abrir', REGRAS_EVENTO.abrir) },
      async (tx, th, pinOk) => (await tx`select foto.evento_recusar(${th}, ${pinOk}, ${tipo}, ${t.versao}, ${t.sha}) as r`)[0].r,
    ),
  )
}

/**
 * Busca aberta. As sondas vão como bytea[] e não ficam em lugar nenhum. Pede a prova da captura (ou, com "Lembrar
 * neste aparelho", a lembrança daquela captura); com a prova, devolve a lembrança para a próxima vez.
 */
export async function achar(req, token, vetores, versao, { aparelho = null, prova: texto = null, lembranca = null } = {}) {
  const s = sondasDe(vetores)
  const t = textoAceito(versao, 'busca')
  if (!s) return { ok: false, erro: 'vetor' }
  if (!t) return { ok: false, erro: 'formato' }
  let comProva = false
  const exige = exigeProva(aparelho, texto, 'busca', 'busca', s, { lembranca })
  const r = resultado(
    await pelaPortaDoEvento(
      req,
      token,
      {
        consome: camadasDaBusca(aparelho ?? ''),
        exige: async (th) => {
          const e = await exige(th)
          comProva = e.prova === true
          return e
        },
      },
      async (tx, th, pinOk) => {
        const x = (await tx`select foto.evento_achar(${th}, ${pinOk}, ${comoBytea(tx, s)}, ${t.versao}, ${t.sha}) as r`)[0].r
        if (x?.ok && comProva) x.lembranca = selarLembranca(th, marcaDe(aparelho, th), shaDosVetores(s), Date.now() + LEMBRAR_MS)
        return x
      },
    ),
  )
  return r
}

/** Modo com consentimento: guarda os vetores de quem pediu, com o sha256 da chave que o celular guarda. */
export async function cadastrar(req, token, vetores, chave, versao, { aparelho = null, prova: texto = null } = {}) {
  const s = sondasDe(vetores)
  const t = textoAceito(versao, 'cadastro', 'cadastroCriancas')
  if (!s) return { ok: false, erro: 'vetor' }
  if (!t || typeof chave !== 'string' || !CHAVE_PESSOA.test(chave)) return { ok: false, erro: 'formato' }
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { consome: camadasDaBusca(aparelho ?? ''), exige: exigeProva(aparelho, texto, 'cadastro', 'cadastro', s) },
      async (tx, th, pinOk) =>
        (await tx`select foto.evento_cadastrar(${th}, ${pinOk}, ${comoBytea(tx, s)}, ${sha256(chave)}, ${t.versao}, ${t.sha}) as r`)[0].r,
    ),
  )
}

export async function minhas(req, token, chave) {
  if (typeof chave !== 'string' || !CHAVE_PESSOA.test(chave)) return { ok: false, erro: 'chave' }
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { limites: (th, ipHash) => [[`evento-minhas:${th}:${ipHash}`, REGRAS_EVENTO.minhasIp]] },
      async (tx, th, pinOk) => (await tx`select foto.evento_minhas(${th}, ${pinOk}, ${sha256(chave)}) as r`)[0].r,
    ),
  )
}

export async function desistir(req, token, chave) {
  if (typeof chave !== 'string' || !CHAVE_PESSOA.test(chave)) return { ok: false, erro: 'chave' }
  const t = textoAceito(TEXTOS.desistencia.versao, 'desistencia')
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { limites: (th, ipHash) => [[`evento-minhas:${th}:${ipHash}`, REGRAS_EVENTO.minhasIp]] },
      async (tx, th, pinOk) => (await tx`select foto.evento_desistir(${th}, ${pinOk}, ${sha256(chave)}, ${t.versao}, ${t.sha}) as r`)[0].r,
    ),
  )
}

/**
 * "Não quero aparecer": sem `fotos`, as parecidas para conferir; com `fotos`, apaga (busca aberta). A mesma prova
 * (para 'remocao') vale uma vez para conferir e uma para apagar.
 */
export async function remover(req, token, vetores, fotos, versao, { aparelho = null, prova: texto = null } = {}) {
  const s = sondasDe(vetores)
  const t = textoAceito(versao, 'remocao')
  if (!s) return { ok: false, erro: 'vetor' }
  if (!t) return { ok: false, erro: 'formato' }
  if (fotos != null && (!Array.isArray(fotos) || fotos.length > 200 || fotos.some((f) => !UUID.test(String(f))))) return { ok: false, erro: 'fotos' }
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { consome: camadasDaBusca(aparelho ?? ''), exige: exigeProva(aparelho, texto, 'remocao', fotos == null ? 'ver' : 'apagar', s) },
      async (tx, th, pinOk) =>
        (await tx`select foto.evento_remover(${th}, ${pinOk}, ${comoBytea(tx, s)}, ${fotos == null ? null : fotos}::uuid[], ${t.versao}, ${t.sha}) as r`)[0].r,
    ),
  )
}

export async function pedir(req, token, nome, contato, fotos) {
  if (typeof nome !== 'string' || nome.length > 200 || typeof contato !== 'string' || contato.length > 300) return { ok: false, erro: 'nome' }
  if (!Array.isArray(fotos) || !fotos.length || fotos.length > 200 || fotos.some((f) => !UUID.test(String(f)))) return { ok: false, erro: 'fotos' }
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { consome: (th, ipHash) => [[`evento-pedir:${th}:${ipHash}`, REGRAS_EVENTO.pedirIp]] },
      async (tx, th, pinOk) => (await tx`select foto.evento_pedir(${th}, ${pinOk}, ${nome}, ${contato}, ${fotos}::uuid[]) as r`)[0].r,
    ),
  )
}

/** Onde está o arquivo de uma foto do link: { chave, tipo, tamanho, sha256 }, null ou 'limite'. */
export async function imagemDoEvento(req, token, foto, mini) {
  if (!UUID.test(String(foto))) return null
  const p = await pelaPortaDoEvento(
    req,
    token,
    { limites: porLink('evento-imagem', REGRAS_EVENTO.imagem), ip: { prefixo: 'evento-imagem-ip', regra: REGRAS_EVENTO.imagemIp } },
    async (tx, th, pinOk) => (await tx`select foto.evento_imagem(${th}, ${pinOk}, ${foto}::uuid, ${mini === true}) as r`)[0].r,
  )
  if (p.estado === 'limite') return 'limite'
  return p.estado === 'ok' ? p.r : null
}

// ───────── limpeza do prazo ─────────

/**
 * Evento com o prazo vencido: os vetores, as pessoas, as ligações e as remoções somem (foto.eventos_limpar) e as
 * prévias saem do armazenamento. Fica a ficha, os pedidos de foto e o registro dos consentimentos. Roda pela conexão
 * do servidor (dono do schema): tarefa agendada, não rota de pessoa. Devolve { ok, eventos, arquivos }.
 */
export async function limparEventos({ arm = armazenamento() } = {}) {
  const sql = banco()
  const ids = (await sql`select foto.eventos_limpar() as ids`)[0].ids ?? []
  let arquivos = 0
  if (!arm) return { ok: true, eventos: ids.length, arquivos, semArmazenamento: true }
  const pendentes = await sql`select id from foto.eventos where estado = 'encerrado' and arquivos_apagados_em is null`
  for (const e of pendentes) {
    const fotos =
      await sql`select chave, enviada_em, mini_enviada_em from foto.evento_fotos where evento = ${e.id} and (enviada_em is not null or mini_enviada_em is not null)`
    arquivos += await apagarArquivos(arm, chavesDe(fotos))
    await sql.begin(async (tx) => {
      await tx`update foto.evento_fotos set enviada_em = null, mini_enviada_em = null where evento = ${e.id}`
      await tx`update foto.eventos set arquivos_apagados_em = now() where id = ${e.id}`
    })
  }
  return { ok: true, eventos: ids.length, arquivos }
}
