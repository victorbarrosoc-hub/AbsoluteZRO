// O link do visitante de um evento (`/e/<token>`): quem abre não tem conta. Mesmo desenho do link da galeria
// (api/_link.js): tudo passa pela porta estreita do banco (db/migrations/0003, `foto.evento_*`, security definer); a
// transação assume `foto_app` sem pessoa, o RLS esconde todas as tabelas e só as funções respondem, e só sobre o evento
// do token. O token é de 32 bytes (o banco guarda o sha256); PIN opcional por scrypt, com a mesma prova em cookie.
//
// A selfie nunca chega aqui: só os 1 a 3 vetores int8 (128 bytes cada, em base64), que vão como argumento da função e
// somem com a transação. Nada deste arquivo escreve vetor em log, em limite ou em erro.
//
// Limites (foto.limites, só o dono do schema): por IP (HMAC do dia; o IP nunca é guardado), por link e, na busca, por
// link e IP: 5 a cada 10 minutos e 30 por dia (docs/estudo/rosto-em-evento.md, B.5). Link desconhecido, revogado,
// vencido ou de evento que não está publicado: a mesma resposta ("morto").

import { createHash } from 'node:crypto'
import { armazenamento, apagarArquivos, chavesDe } from './_arquivos.js'
import { banco } from './_banco.js'
import { comoLink, ehToken, hashToken, ipDe, ipHashDoDia, nomeCookiePin, pinConfere, prova, PROVA_S, provaConfere, UUID } from './_link.js'
import { consumir, dentroDoLimite, registrarTentativa } from './_limite.js'
import { lerCookie } from './_zro.js'
import { vetorDeTexto } from '../src/rosto/assinatura.js'
import { PELA_VERSAO, TEXTOS, textoDoRegistro } from '../src/rosto/textos.js'

export const REGRAS_EVENTO = {
  /** Qualquer pedido de link de evento (menos imagem) por IP. */
  ip: { max: 1200, janelaS: 3600 },
  /** Link que não existe: 30 por hora por IP (a mesma conta do link da galeria). */
  mortoIp: { max: 30, janelaS: 3600 },
  /** Abrir: 3.000 por hora por link (evento grande, muita gente ao mesmo tempo). */
  abrir: { max: 3000, janelaS: 3600 },
  /** PIN errado: 5 a cada 15 minutos por link e IP; 60 por link. */
  pinIp: { max: 5, janelaS: 900 },
  pin: { max: 60, janelaS: 900 },
  /** Busca, pedido de busca e remoção: 5 a cada 10 minutos e 30 por dia por link e IP; 1.200 por hora por link. */
  buscaIp: { max: 5, janelaS: 600 },
  buscaIpDia: { max: 30, janelaS: 86400 },
  busca: { max: 1200, janelaS: 3600 },
  /** Voltar e ver as minhas: 120 por hora por link e IP. Pedir fotos: 10 por hora por link e IP. */
  minhasIp: { max: 120, janelaS: 3600 },
  pedirIp: { max: 10, janelaS: 3600 },
  /** Imagens: 40.000 por hora por link e 3.000 por IP. */
  imagem: { max: 40000, janelaS: 3600 },
  imagemIp: { max: 3000, janelaS: 3600 },
}

export const CHAVE_PESSOA = /^[A-Za-z0-9_-]{43}$/
export const sha256 = (t) => createHash('sha256').update(t).digest('hex')

/** A versão do texto que a página mostrou, conferida: { versao, sha } ou null (versão que não existe ou de outro tipo). */
export function textoAceito(versao, ...tipos) {
  const chave = PELA_VERSAO[versao]
  if (!chave || !tipos.includes(chave)) return null
  return { versao, sha: sha256(textoDoRegistro(chave)) }
}

/** 1 a 3 vetores em base64 → lista de bytea em hex (128 bytes cada), ou null. */
export function sondasDe(lista) {
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > 3) return null
  const saida = []
  for (const t of lista) {
    const q = vetorDeTexto(t)
    if (!q) return null
    // em hex (o texto de um bytea): vira bytea[] no banco; o vetor não é guardado nem escrito em log
    saida.push(`\\x${Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString('hex')}`)
  }
  return saida
}

const pinDoEvento = async (tx, th) => (await tx`select foto.evento_pin(${th}) as r`)[0]?.r ?? null
const nomeCookie = (token) => nomeCookiePin(token).replace('foto_pin_', 'foto_epin_')
const pinOkDe = (req, token, pin) => !pin.pin || provaConfere(lerCookie(req, nomeCookie(token)), pin.link, pin.versao)

/**
 * Antes de tudo: limites do IP, forma do token, limites da ação, link vivo, prova do PIN; depois `fn(tx, th, pinOk)` na
 * transação da porta. { estado: 'limite' | 'morto' } ou { estado: 'ok', r }.
 * `limites`: [[chave, regra]] a mais (por link, por link e IP). `consome`: os que contam ANTES de rodar (busca).
 */
export async function pelaPortaDoEvento(req, token, { limites = () => [], consome = () => [], ip = null } = {}, fn) {
  const ipHash = ipHashDoDia(ipDe(req))
  const doIp = [[ip ? `${ip.prefixo}:${ipHash}` : `evento-ip:${ipHash}`, ip ? ip.regra : REGRAS_EVENTO.ip], [`link-morto:${ipHash}`, REGRAS_EVENTO.mortoIp]]
  if (!ehToken(token)) {
    if (!(await dentroDoLimite(doIp))) return { estado: 'limite' }
    await registrarTentativa(doIp[0][0], `link-morto:${ipHash}`)
    return { estado: 'morto' }
  }
  const th = hashToken(token)
  const extras = limites(th, ipHash)
  if (!(await dentroDoLimite([...doIp, ...extras]))) return { estado: 'limite' }
  const consumir_ = consome(th, ipHash)
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
  if (consumir_.length && saida.pinOk && !(await consumir(consumir_))) return { estado: 'limite' }
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
  const doIp = [[`evento-ip:${ipHash}`, REGRAS_EVENTO.ip], [`link-morto:${ipHash}`, REGRAS_EVENTO.mortoIp]]
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
  if (!(await dentroDoLimite([[chaveIp, REGRAS_EVENTO.pinIp], [chaveLink, REGRAS_EVENTO.pin]]))) return { ok: false, erro: 'limite' }
  if (pin.pin && !pinConfere(String(pinDigitado ?? '').trim(), pin.pin)) {
    await registrarTentativa(chaveIp, chaveLink, `evento-ip:${ipHash}`)
    return { ok: false, erro: 'pin' }
  }
  await registrarTentativa(`evento-ip:${ipHash}`)
  return { ok: true, cookie: { nome: nomeCookie(token), valor: prova(pin.link, pin.versao, Date.now() + PROVA_S * 1000), maxAge: PROVA_S } }
}

/** O que a porta devolveu vira { ok: true, … } ou { ok: false, erro }. */
export function resultado(p) {
  if (p.estado === 'limite') return { ok: false, erro: 'limite' }
  if (p.estado === 'morto' || !p.r) return { ok: false, erro: 'link' }
  if (p.r.erro) return { ok: false, ...p.r }
  return p.r
}

// ───────── as ações do visitante ─────────

const porLink = (prefixo, regra) => (th) => [[`${prefixo}:${th}`, regra]]
const busca = (th, ipHash) => [
  [`evento-busca:${th}:${ipHash}`, REGRAS_EVENTO.buscaIp],
  [`evento-busca-dia:${th}:${ipHash}`, REGRAS_EVENTO.buscaIpDia],
  [`evento-busca:${th}`, REGRAS_EVENTO.busca],
]

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
  const t = textoAceito(versao, tipo)
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

/** Busca aberta. As sondas vão como bytea[] e não ficam em lugar nenhum. */
export async function achar(req, token, vetores, versao) {
  const s = sondasDe(vetores)
  const t = textoAceito(versao, 'busca')
  if (!s) return { ok: false, erro: 'vetor' }
  if (!t) return { ok: false, erro: 'formato' }
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { consome: busca },
      async (tx, th, pinOk) => (await tx`select foto.evento_achar(${th}, ${pinOk}, ${s}::bytea[], ${t.versao}, ${t.sha}) as r`)[0].r,
    ),
  )
}

/** Modo com consentimento: guarda os vetores de quem pediu, com o sha256 da chave que o celular guarda. */
export async function cadastrar(req, token, vetores, chave, versao) {
  const s = sondasDe(vetores)
  const t = textoAceito(versao, 'cadastro')
  if (!s) return { ok: false, erro: 'vetor' }
  if (!t || typeof chave !== 'string' || !CHAVE_PESSOA.test(chave)) return { ok: false, erro: 'formato' }
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { consome: busca },
      async (tx, th, pinOk) => (await tx`select foto.evento_cadastrar(${th}, ${pinOk}, ${s}::bytea[], ${sha256(chave)}, ${t.versao}, ${t.sha}) as r`)[0].r,
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

/** "Não quero aparecer": sem `fotos`, as parecidas para conferir; com `fotos`, apaga (busca aberta). */
export async function remover(req, token, vetores, fotos, versao) {
  const s = sondasDe(vetores)
  const t = textoAceito(versao, 'remocao')
  if (!s) return { ok: false, erro: 'vetor' }
  if (!t) return { ok: false, erro: 'formato' }
  if (fotos != null && (!Array.isArray(fotos) || fotos.length > 200 || fotos.some((f) => !UUID.test(String(f))))) return { ok: false, erro: 'fotos' }
  return resultado(
    await pelaPortaDoEvento(
      req,
      token,
      { consome: busca },
      async (tx, th, pinOk) =>
        (await tx`select foto.evento_remover(${th}, ${pinOk}, ${s}::bytea[], ${fotos == null ? null : fotos}::uuid[], ${t.versao}, ${t.sha}) as r`)[0].r,
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
    const fotos = await sql`select chave, enviada_em, mini_enviada_em from foto.evento_fotos where evento = ${e.id} and (enviada_em is not null or mini_enviada_em is not null)`
    arquivos += await apagarArquivos(arm, chavesDe(fotos))
    await sql.begin(async (tx) => {
      await tx`update foto.evento_fotos set enviada_em = null, mini_enviada_em = null where evento = ${e.id}`
      await tx`update foto.eventos set arquivos_apagados_em = now() where id = ${e.id}`
    })
  }
  return { ok: true, eventos: ids.length, arquivos }
}
