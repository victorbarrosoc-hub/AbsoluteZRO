// Núcleo do rádio: as regras das diárias, da batida (presença e sinais de conexão) e dos avisos de set, sem HTTP e sem
// conexão própria. Recebe `tx` já dentro da transação como `radio_app` (RLS) com radio.user_sub = a pessoa, e `p` =
// { sub, nome } vindos da sessão (nunca do pedido). Devolve { status, corpo }.
//
// Dois lugares usam este arquivo: as rotas deste app (api/radio/*, por `comoPessoa`) e o HUB (absolutezro.com/radio,
// apps/hub-web/lib/radio/nucleo.ts é cópia gerada por scripts/para-o-hub.mjs; um teste do HUB confere a cópia).

import { randomInt } from 'node:crypto'

export const FUNCOES = ['direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco']
export const TIPOS_AVISO = ['silencio', 'acao', 'corta', 'intervalo']
/** Online = bateu nos últimos 20 s. */
export const ONLINE_S = 20

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const sortear = (alfabeto, n) => Array.from({ length: n }, () => alfabeto[randomInt(alfabeto.length)]).join('')
const ID = /^[a-z0-9]{12}$/
const PEER = /^[a-z0-9]{16,32}$/
const r = (status, corpo) => ({ status, corpo })

/** Nome de exibição: sem controle nem bidi, até 60. */
export function nomeLimpo(v) {
  if (typeof v !== 'string') return null
  const s = v
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '')
    .trim()
    .slice(0, 60)
  return s || null
}

const publica = (d) => ({ id: d.id, codigo: d.codigo, nome: d.nome, dono: d.papel === 'dono', funcao: d.funcao ?? null })

async function lerDiaria(tx, sub, id) {
  const [d] = await tx`
    select d.id, d.codigo, d.nome, m.papel, m.funcao from radio.diarias d
    join radio.membros m on m.diaria_id = d.id and m.user_sub = ${sub}
    where d.id = ${id} and d.expira > now()`
  return d ? publica(d) : null
}

/** GET: as diárias da pessoa. */
export async function listarDiarias(tx, p) {
  const lista = await tx`
    select d.id, d.codigo, d.nome, m.papel, m.funcao from radio.membros m
    join radio.diarias d on d.id = m.diaria_id
    where m.user_sub = ${p.sub} and d.expira > now()
    order by m.entrou desc limit 30`
  return r(200, { ok: true, diarias: lista.map(publica) })
}

/** POST { acao: criar | entrar | funcao }. Criar roda em savepoint para sortear de novo um código repetido. */
export async function mudarDiarias(tx, p, c) {
  if (c?.acao === 'criar') {
    const nome = nomeLimpo(c.nome)
    if (!nome) return r(400, { ok: false, erro: 'nome' })
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const id = sortear(MINUSCULAS, 12)
      const codigo = sortear(LETRAS, 6)
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into radio.diarias (id, codigo, nome, dono_sub) values (${id}, ${codigo}, ${nome}, ${p.sub})`
          await sp`insert into radio.membros (diaria_id, user_sub, nome, papel, funcao) values (${id}, ${p.sub}, ${p.nome}, 'dono', 'direcao')`
        })
        return r(201, { ok: true, diaria: await lerDiaria(tx, p.sub, id) })
      } catch (e) {
        if (e?.code !== '23505') throw e // código repetido: sorteia de novo
      }
    }
    return r(500, { ok: false, erro: 'codigo' })
  }

  if (c?.acao === 'entrar') {
    const codigo = String(c.codigo || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(codigo)) return r(404, { ok: false, erro: 'codigo' })
    const [e] = await tx`select radio.entrar(${codigo}, ${p.nome}) as id`
    const d = e?.id ? await lerDiaria(tx, p.sub, e.id) : null
    return d ? r(200, { ok: true, diaria: d }) : r(404, { ok: false, erro: 'codigo' })
  }

  if (c?.acao === 'funcao') {
    if (!ID.test(String(c.diaria || '')) || !FUNCOES.includes(c.funcao)) return r(400, { ok: false })
    const n = await tx`update radio.membros set funcao = ${c.funcao} where diaria_id = ${c.diaria} and user_sub = ${p.sub}`
    return n.count ? r(200, { ok: true }) : r(404, { ok: false })
  }

  return r(400, { ok: false, erro: 'acao' })
}

/**
 * POST batida { diaria, peer, sinais: [{ para, tipo: oferta|resposta, dados: { sdp } }], aviso: último id visto }.
 * Diz que o aparelho está na diária, entrega e recebe os sinais de conexão (a voz nunca passa por aqui) e os avisos
 * perdidos. Fora da diária: 403.
 */
export async function bater(tx, p, c) {
  const diaria = String(c?.diaria || '')
  const peer = String(c?.peer || '')
  if (!ID.test(diaria) || !PEER.test(peer)) return r(400, { ok: false })
  const saida = (Array.isArray(c.sinais) ? c.sinais : [])
    .slice(0, 20)
    .filter((s) => s && PEER.test(String(s.para || '')) && (s.tipo === 'oferta' || s.tipo === 'resposta') && typeof s.dados?.sdp === 'string' && s.dados.sdp.length <= 12000)
  const ultimo = Number.isSafeInteger(c.aviso) && c.aviso >= 0 ? c.aviso : null

  const [m] = await tx`select papel, funcao, radio.pode_avisar(${diaria}) as pode from radio.membros where diaria_id = ${diaria} and user_sub = ${p.sub} and radio.membro(${diaria})`
  if (!m) return r(403, { ok: false, erro: 'fora' })
  await tx`
    insert into radio.presencas (diaria_id, peer, user_sub) values (${diaria}, ${peer}, ${p.sub})
    on conflict (diaria_id, peer) do update set visto = now()`
  for (const s of saida) {
    const [alvo] = await tx`select user_sub from radio.presencas where diaria_id = ${diaria} and peer = ${s.para} and visto > now() - make_interval(secs => ${ONLINE_S})`
    if (!alvo) continue
    await tx`
      insert into radio.sinais (diaria_id, de_peer, de_sub, para_peer, para_sub, tipo, dados)
      values (${diaria}, ${peer}, ${p.sub}, ${s.para}, ${alvo.user_sub}, ${s.tipo}, ${tx.json({ sdp: s.dados.sdp })})`
  }
  const chegaram = await tx`
    delete from radio.sinais where para_sub = ${p.sub} and diaria_id = ${diaria} and para_peer = ${peer}
    returning id, de_peer, tipo, dados`
  // sinal velho que ninguém pegou (aparelho que saiu) não fica
  await tx`delete from radio.sinais where de_sub = ${p.sub} and criado < now() - interval '2 minutes'`
  const pessoas = await tx`
    select pr.peer, m.nome, m.funcao, m.papel, pr.user_sub = ${p.sub} as minha from radio.presencas pr
    join radio.membros m on m.diaria_id = pr.diaria_id and m.user_sub = pr.user_sub
    where pr.diaria_id = ${diaria} and pr.visto > now() - make_interval(secs => ${ONLINE_S})
    order by m.nome, pr.peer limit 40`
  const [topo] = await tx`select coalesce(max(id), 0)::bigint as id from radio.avisos where diaria_id = ${diaria}`
  const avisos =
    ultimo == null
      ? []
      : await tx`
        select id, tipo, de_nome from radio.avisos
        where diaria_id = ${diaria} and id > ${ultimo} and criado > now() - interval '30 seconds'
        order by id limit 10`
  return r(200, {
    ok: true,
    eu: { peer, nome: p.nome, funcao: m.funcao ?? null, dono: m.papel === 'dono', podeAvisar: m.pode },
    pessoas: pessoas.map((x) => ({ peer: x.peer, nome: x.nome, funcao: x.funcao ?? null, dono: x.papel === 'dono', eu: x.peer === peer, minha: x.minha })),
    sinais: [...chegaram].sort((a, b) => Number(a.id) - Number(b.id)).map((s) => ({ de: s.de_peer, tipo: s.tipo, dados: s.dados })),
    avisos: avisos.map((a) => ({ id: Number(a.id), tipo: a.tipo, de: a.de_nome })),
    ultimoAviso: Number(topo.id),
  })
}

/** POST aviso { diaria, tipo }: só quem criou a diária ou quem está na Direção (conferido também pelo RLS). */
export async function avisar(tx, p, c) {
  const diaria = String(c?.diaria || '')
  if (!ID.test(diaria) || !TIPOS_AVISO.includes(c?.tipo)) return r(400, { ok: false })
  const [pode] = await tx`select radio.pode_avisar(${diaria}) as ok`
  if (!pode?.ok) return r(403, { ok: false, erro: 'sem_permissao' })
  const [a] = await tx`insert into radio.avisos (diaria_id, tipo, de_sub, de_nome) values (${diaria}, ${c.tipo}, ${p.sub}, ${p.nome}) returning id`
  return r(201, { ok: true, aviso: { id: Number(a.id), tipo: c.tipo, de: p.nome } })
}

// ───────── TURN (voz entre redes diferentes) ─────────
// Sem ponte, a voz só fecha quando os aparelhos se alcançam direto (mesma rede, a maioria das redes de casa); em 4G com
// CGNAT não fecha. Com a chave TURN da Cloudflare (CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_API_TOKEN, só no servidor),
// cada pedido ganha credenciais temporárias. A voz segue cifrada de ponta a ponta (DTLS-SRTP): a ponte não ouve.

export const STUN_PADRAO = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
export const TURN_TTL_S = 6 * 3600

/** { iceServers } para o RTCPeerConnection: com a chave TURN, as credenciais da Cloudflare; sem ela (ou falhando), só STUN. */
export async function pedirIceServers(env, buscar = fetch) {
  const id = String(env?.CLOUDFLARE_TURN_KEY_ID || '').trim()
  const token = String(env?.CLOUDFLARE_TURN_API_TOKEN || '').trim()
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id) || !token) return { iceServers: STUN_PADRAO, turn: false }
  try {
    const r = await buscar(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL_S }),
      signal: AbortSignal.timeout(5000),
    })
    const corpo = r.ok ? await r.json() : null
    const lista = Array.isArray(corpo?.iceServers) ? corpo.iceServers : null
    if (!lista?.length) return { iceServers: STUN_PADRAO, turn: false }
    // sem trickle ICE: a porta 53 (o navegador bloqueia) só atrasaria juntar os candidatos
    const servidores = lista
      .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length)
    return { iceServers: servidores, turn: servidores.some((s) => s.urls.some((u) => u.startsWith('turn'))) }
  } catch {
    return { iceServers: STUN_PADRAO, turn: false }
  }
}
