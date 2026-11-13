// O link do cliente (`/g/<token>`): quem abre não tem conta. Tudo passa pela "porta estreita" do banco
// (db/migrations/0001: `foto.link_*`, security definer). A transação assume `foto_app` SEM pessoa, então o RLS esconde
// todas as tabelas e só as funções `link_*` respondem, e só sobre a galeria do token. Molde: o link do cliente do
// Maestro (products/maestro/src/lib/revisao/link.ts).
//
// - Token: 32 bytes aleatórios em base64url (43 caracteres). O banco guarda só o sha256: o endereço aparece uma vez,
//   para quem publicou; perdeu, troca o link.
// - PIN opcional (4 a 8 dígitos): scrypt no servidor. Acertou, o navegador ganha um cookie assinado (link + versão do
//   PIN) por 12 horas; trocar o PIN derruba as provas antigas.
// - Limites (api/_limite.js): por link e por IP. O IP nunca é guardado: só o HMAC com o dia.
// - Link desconhecido, revogado, vencido ou de galeria encerrada: a mesma resposta ("morto"), sem dizer de quem é.
// - Chave do HMAC: sai de ZRO_CLIENT_SECRET por HKDF. Sem o login configurado o app está fechado e o link também; a
//   única exceção é o modo local (FOTO_LOCAL=1 em localhost), que usa uma chave sorteada por processo.

import { createHash, createHmac, hkdfSync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { banco, nuvemLigada, PAPEL_APP } from './_banco.js'
import { dentroDoLimite, registrarTentativa, REGRAS } from './_limite.js'
import { modoLocal } from './_sessao.js'
import { configurado, lerCookie } from './_zro.js'

export const TOKEN_LINK = /^[A-Za-z0-9_-]{43}$/
export const PIN = /^\d{4,8}$/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const PROVA_S = 12 * 3600

export const ehToken = (t) => typeof t === 'string' && TOKEN_LINK.test(t)
export const novoToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

/** O link do cliente responde? Só com o login configurado (ou no modo local) e com o banco ligado. */
export const linkLigado = (req) => (configurado() || modoLocal(req)) && nuvemLigada()

// ───────── chave ─────────

const g = globalThis
function segredo() {
  const s = (process.env.ZRO_CLIENT_SECRET || '').trim()
  if (s) return s
  // modo local: uma chave por processo (as provas de PIN caem quando o servidor reinicia)
  return (g.__fotoLinkSegredo ??= randomBytes(32).toString('hex'))
}
const chave = (uso) => Buffer.from(hkdfSync('sha256', Buffer.from(segredo(), 'utf8'), Buffer.from('foto-link', 'utf8'), Buffer.from(uso, 'utf8'), 32))
const assinar = (texto, uso) => createHmac('sha256', chave(uso)).update(texto).digest('base64url').slice(0, 43)

// ───────── PIN ─────────

/** scrypt (N=2^14, r=8, p=1) com sal próprio: "s1$<sal>$<hash>". */
export function hashPin(pin) {
  if (!PIN.test(String(pin))) throw new Error('PIN inválido')
  const sal = randomBytes(16)
  const h = scryptSync(String(pin), sal, 32, { N: 16384, r: 8, p: 1 })
  return `s1$${sal.toString('base64url')}$${h.toString('base64url')}`
}

export function pinConfere(pin, guardado) {
  const [v, sal, h] = String(guardado ?? '').split('$')
  if (v !== 's1' || !sal || !h || !PIN.test(String(pin))) return false
  const esperado = Buffer.from(h, 'base64url')
  const veio = scryptSync(String(pin), Buffer.from(sal, 'base64url'), esperado.length, { N: 16384, r: 8, p: 1 })
  return veio.length === esperado.length && timingSafeEqual(veio, esperado)
}

/** Cookie do PIN: um por link (pelo começo do hash do token), sem nada que identifique a galeria. */
export const nomeCookiePin = (token) => `foto_pin_${hashToken(token).slice(0, 16)}`

export function prova(linkId, versao, ate) {
  const corpo = `${linkId}.${versao}.${ate}`
  return `${corpo}.${assinar(corpo, 'pin')}`
}

export function provaConfere(valor, linkId, versao) {
  const partes = String(valor ?? '').split('.')
  if (partes.length !== 4) return false
  const [id, v, ate, sig] = partes
  if (id !== linkId || Number(v) !== versao || !(Number(ate) > Date.now())) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(assinar(`${id}.${v}.${ate}`, 'pin'))
  return a.length === b.length && timingSafeEqual(a, b)
}

// ───────── IP ─────────

/** O IP de quem pediu (a Vercel escreve x-real-ip e x-forwarded-for por cima do que o cliente manda). */
export function ipDe(req) {
  const real = String(req.headers['x-real-ip'] || '').trim()
  const encaminhado = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()
  return (real || encaminhado || req.socket?.remoteAddress || 'desconhecido').slice(0, 64)
}

/** HMAC do IP com o dia: dá para contar abuso, não dá para saber o IP. */
export const ipHashDoDia = (ip, agora = new Date()) =>
  createHmac('sha256', chave('ip'))
    .update(`${ip || 'desconhecido'}|${agora.toISOString().slice(0, 10)}`)
    .digest('hex')
    .slice(0, 32)

// ───────── porta estreita ─────────

/** Transação como `foto_app` sem pessoa: o RLS esconde tudo e só as funções link_* respondem. */
export function comoLink(fn) {
  return banco().begin(async (tx) => {
    await tx.unsafe(`set local role ${PAPEL_APP}`)
    return fn(tx)
  })
}

const pinDoLink = async (tx, th) => (await tx`select foto.link_pin(${th}) as r`)[0]?.r ?? null
const pinOkDe = (req, token, pin) => !pin.pin || provaConfere(lerCookie(req, nomeCookiePin(token)), pin.link, pin.versao)
const limitesDeIp = (ipHash) => [
  [`link-ip:${ipHash}`, REGRAS.linkIp],
  [`link-morto:${ipHash}`, REGRAS.linkMortoIp],
]

/**
 * O que é preciso antes de qualquer coisa: limites do IP, forma do token, limite da ação por link, link vivo e a prova
 * do PIN; depois roda `fn(tx, hashDoToken, pinOk)` na mesma transação da porta.
 * Devolve { estado: 'limite' } | { estado: 'morto' } | { estado: 'ok', r } (r = o que `fn` devolveu).
 * `acao`: { prefixo, regra } conta por link; `ip`: { prefixo, regra } troca os limites gerais de IP (imagens).
 */
export async function pelaPorta(req, token, acao, fn, { ip = null } = {}) {
  const ipHash = ipHashDoDia(ipDe(req))
  const doIp = ip ? [[`${ip.prefixo}:${ipHash}`, ip.regra], limitesDeIp(ipHash)[1]] : limitesDeIp(ipHash)
  if (!ehToken(token)) {
    if (!(await dentroDoLimite(doIp))) return { estado: 'limite' }
    await registrarTentativa(doIp[0][0], `link-morto:${ipHash}`)
    return { estado: 'morto' }
  }
  const th = hashToken(token)
  const daAcao = acao ? [[`${acao.prefixo}:${th}`, acao.regra]] : []
  if (!(await dentroDoLimite([...doIp, ...daAcao]))) return { estado: 'limite' }
  const saida = await comoLink(async (tx) => {
    const pin = await pinDoLink(tx, th)
    if (!pin) return null
    return { r: await fn(tx, th, pinOkDe(req, token, pin), pin) }
  })
  if (!saida) {
    await registrarTentativa(doIp[0][0], `link-morto:${ipHash}`)
    return { estado: 'morto' }
  }
  await registrarTentativa(doIp[0][0], ...daAcao.map(([c]) => c))
  return { estado: 'ok', r: saida.r }
}

/** O link do token está vivo? Para servir a página (/g/<token>): 'ok' | 'morto' | 'limite'. Não conta abertura. */
export async function linkVivo(req, token) {
  const p = await pelaPorta(req, token, null, async () => true)
  return p.estado
}

/** Abre a galeria. { estado: 'morto' | 'limite' | 'pin' } ou { estado: 'ok', dados }. `contar`: abertura da página. */
export async function abrirLink(req, token, { contar = false } = {}) {
  const p = await pelaPorta(
    req,
    token,
    { prefixo: 'link-abrir', regra: REGRAS.linkAbrir },
    async (tx, th, pinOk) => (await tx`select foto.link_abrir(${th}, ${pinOk}, ${contar}) as r`)[0].r,
  )
  if (p.estado !== 'ok') return p
  if (!p.r) return { estado: 'morto' }
  if (p.r.estado === 'pin') return { estado: 'pin' }
  const { estado: _e, ...dados } = p.r
  return { estado: 'ok', dados }
}

/**
 * Confere o PIN. { ok: true, cookie: { nome, valor, maxAge } } ou { ok: false, erro: 'morto' | 'limite' | 'pin' }.
 * PIN errado conta no limite por link e IP (5 a cada 15 min) e por link (20).
 */
export async function conferirPin(req, token, pinDigitado) {
  const ipHash = ipHashDoDia(ipDe(req))
  if (!(await dentroDoLimite(limitesDeIp(ipHash)))) return { ok: false, erro: 'limite' }
  if (!ehToken(token)) {
    await registrarTentativa(`link-ip:${ipHash}`, `link-morto:${ipHash}`)
    return { ok: false, erro: 'morto' }
  }
  const th = hashToken(token)
  const pin = await comoLink((tx) => pinDoLink(tx, th))
  if (!pin) {
    await registrarTentativa(`link-ip:${ipHash}`, `link-morto:${ipHash}`)
    return { ok: false, erro: 'morto' }
  }
  const chaveIp = `link-pin:${th}:${ipHash}`
  const chaveLink = `link-pin:${th}`
  if (
    !(await dentroDoLimite([
      [chaveIp, REGRAS.linkPinIp],
      [chaveLink, REGRAS.linkPin],
    ]))
  )
    return { ok: false, erro: 'limite' }
  const cookie = { nome: nomeCookiePin(token), valor: prova(pin.link, pin.versao, Date.now() + PROVA_S * 1000), maxAge: PROVA_S }
  if (pin.pin && !pinConfere(String(pinDigitado ?? '').trim(), pin.pin)) {
    await registrarTentativa(chaveIp, chaveLink, `link-ip:${ipHash}`)
    return { ok: false, erro: 'pin' }
  }
  await registrarTentativa(`link-ip:${ipHash}`)
  return { ok: true, cookie }
}

/** O que a porta devolveu vira { ok: true, ... } ou { ok: false, erro }. */
function resultado(p) {
  if (p.estado === 'limite') return { ok: false, erro: 'limite' }
  if (p.estado === 'morto' || !p.r) return { ok: false, erro: 'link' }
  if (p.r.erro) return { ok: false, ...p.r }
  return p.r
}

/** Escolhe (ou desfaz) uma foto. { ok, escolhida, escolhidas, extras } ou { ok: false, erro }. */
export async function escolherFoto(req, token, foto, escolhida) {
  if (!UUID.test(String(foto)) || typeof escolhida !== 'boolean') return { ok: false, erro: 'formato' }
  return resultado(
    await pelaPorta(
      req,
      token,
      { prefixo: 'link-escolher', regra: REGRAS.linkEscolher },
      async (tx, th, pinOk) => (await tx`select foto.link_escolher(${th}, ${pinOk}, ${foto}::uuid, ${escolhida}) as r`)[0].r,
    ),
  )
}

/** Comentário curto e etiquetas de uma foto (os dois de uma vez). { ok, comentario, etiquetas } ou { ok: false, erro }. */
export async function comentarFoto(req, token, foto, comentario, etiquetas) {
  const texto = comentario == null ? '' : comentario
  const lista = etiquetas == null ? [] : etiquetas
  if (!UUID.test(String(foto)) || typeof texto !== 'string' || texto.length > 2000) return { ok: false, erro: 'formato' }
  if (!Array.isArray(lista) || lista.length > 16 || lista.some((e) => typeof e !== 'string' || !/^[a-z_]{1,40}$/.test(e)))
    return { ok: false, erro: 'etiquetas' }
  return resultado(
    await pelaPorta(
      req,
      token,
      { prefixo: 'link-comentar', regra: REGRAS.linkComentar },
      async (tx, th, pinOk) =>
        (await tx`select foto.link_comentar(${th}, ${pinOk}, ${foto}::uuid, ${texto}, string_to_array(nullif(${lista.join(',')}, ''), ',')) as r`)[0].r,
    ),
  )
}

/** O envio final, com o nome de quem envia. { ok, envio } ou { ok: false, erro }. */
export async function enviarSelecao(req, token, nome) {
  if (typeof nome !== 'string' || nome.length > 200) return { ok: false, erro: 'nome' }
  return resultado(
    await pelaPorta(
      req,
      token,
      { prefixo: 'link-enviar', regra: REGRAS.linkEnviar },
      async (tx, th, pinOk) => (await tx`select foto.link_enviar(${th}, ${pinOk}, ${nome}) as r`)[0].r,
    ),
  )
}

/** Onde está o arquivo de uma foto do link: { chave, tipo, tamanho, sha256 }, null (não há) ou 'limite'. */
export async function imagemDoLink(req, token, foto, mini) {
  if (!UUID.test(String(foto))) return null
  const p = await pelaPorta(
    req,
    token,
    { prefixo: 'link-imagem', regra: REGRAS.linkImagem },
    async (tx, th, pinOk) => (await tx`select foto.link_imagem(${th}, ${pinOk}, ${foto}::uuid, ${mini === true}) as r`)[0].r,
    { ip: { prefixo: 'link-imagem-ip', regra: REGRAS.linkImagemIp } },
  )
  if (p.estado === 'limite') return 'limite'
  return p.estado === 'ok' ? p.r : null
}
