// Núcleo do rádio: as regras das diárias, da batida (presença e sinais de conexão) e dos avisos de set, sem HTTP e sem
// conexão própria. Recebe `tx` já dentro da transação como `radio_app` (RLS) com radio.user_sub = a pessoa, e `p` =
// { sub, nome } vindos da sessão (nunca do pedido). Devolve { status, corpo }.
//
// Dois lugares usam este arquivo: as rotas deste app (api/radio/*, por `comoPessoa`) e o HUB (absolutezro.com/radio,
// apps/hub-web/lib/radio/nucleo.ts é cópia gerada por scripts/para-o-hub.mjs; um teste do HUB confere a cópia).

import { randomInt } from 'node:crypto'

export const FUNCOES = ['direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco']
export const TIPOS_AVISO = ['silencio', 'acao', 'corta', 'intervalo']
export const PAPEIS = ['dono', 'responsavel', 'equipe', 'convidado']
/** Ações de moderação (regras e poderes em db/migrations/0001_poderes.sql, radio.moderar). */
export const ACOES = ['silenciar', 'reativar', 'silenciar_todos', 'reativar_todos', 'mover', 'responsavel', 'papel', 'tirar', 'mao', 'baixar_mao']
const APELIDO = /^[a-f0-9]{16}$/
const RECUSA = { fora: 403, sem_permissao: 403, imune: 409, nao_achei: 404, invalido: 400 }
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

const publica = (d) => ({ id: d.id, codigo: d.codigo, nome: d.nome, dono: d.papel === 'dono', papel: d.papel, funcao: d.funcao ?? null, criado: d.criado ?? null, pessoas: d.pessoas ?? null, noAr: d.no_ar ?? null })

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
    select d.id, d.codigo, d.nome, d.criado, m.papel, m.funcao,
      (select count(*)::int from radio.membros x where x.diaria_id = d.id) as pessoas,
      (select count(distinct pr.user_sub)::int from radio.presencas pr
        where pr.diaria_id = d.id and pr.visto > now() - make_interval(secs => ${ONLINE_S})) as no_ar
    from radio.membros m
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
    const [n] = await tx`select radio.meu_setor(${c.diaria}, ${c.funcao}) as ok`
    return n?.ok ? r(200, { ok: true }) : r(404, { ok: false })
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

  const [m] = await tx`
    select m.papel, m.funcao, radio.pode_avisar(${diaria}) as pode, radio.apelido(${diaria}, m.user_sub) as apelido,
      d.gravando_silencia, d.pedir_palavra, d.silencio_min
    from radio.membros m join radio.diarias d on d.id = m.diaria_id
    where m.diaria_id = ${diaria} and m.user_sub = ${p.sub} and radio.membro(${diaria})`
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
    select pr.peer, m.nome, m.funcao, m.papel, pr.user_sub = ${p.sub} as minha, radio.apelido(${diaria}, m.user_sub) as apelido from radio.presencas pr
    join radio.membros m on m.diaria_id = pr.diaria_id and m.user_sub = pr.user_sub
    where pr.diaria_id = ${diaria} and pr.visto > now() - make_interval(secs => ${ONLINE_S})
    order by m.nome, pr.peer limit 40`
  const membros = await tx`
    select radio.apelido(${diaria}, m.user_sub) as apelido, m.nome, m.papel, m.funcao,
      exists (select 1 from radio.presencas pr where pr.diaria_id = m.diaria_id and pr.user_sub = m.user_sub
        and pr.visto > now() - make_interval(secs => ${ONLINE_S})) as online
    from radio.membros m where m.diaria_id = ${diaria} order by m.nome limit 200`
  const silenciados = await tx`select apelido, por, ate, motivo from radio.silenciados(${diaria})`
  const maos = await tx`select radio.apelido(${diaria}, user_sub) as apelido from radio.maos where diaria_id = ${diaria} order by criado`
  const globais = await tx`
    select tipo, alvo, motivo, por_nome, criado from radio.silencios
    where diaria_id = ${diaria} and tipo in ('todos', 'setor') and (ate is null or ate > now()) order by id`
  const [topo] = await tx`select coalesce(max(id), 0)::bigint as id from radio.avisos where diaria_id = ${diaria}`
  const avisos =
    ultimo == null
      ? []
      : await tx`
        select id, tipo, de_nome, setor from radio.avisos
        where diaria_id = ${diaria} and id > ${ultimo} and criado > now() - interval '30 seconds'
          and (setor is null or setor = ${m.funcao ?? ''} or ${m.papel === 'dono'} or ${m.funcao === 'direcao'})
        order by id limit 10`
  const quando = (t) => (t ? new Date(t).toISOString() : null)
  const meuSilencio = silenciados.find((x) => x.apelido === m.apelido)
  const todos = globais.find((g) => g.tipo === 'todos')
  return r(200, {
    ok: true,
    eu: {
      peer,
      nome: p.nome,
      apelido: m.apelido,
      funcao: m.funcao ?? null,
      papel: m.papel,
      dono: m.papel === 'dono',
      podeAvisar: m.pode,
      podeModerar: m.papel === 'dono' || m.papel === 'responsavel',
      silenciado: meuSilencio ? { por: meuSilencio.por ?? null, ate: quando(meuSilencio.ate), motivo: meuSilencio.motivo } : null,
    },
    pessoas: pessoas.map((x) => ({ peer: x.peer, apelido: x.apelido, nome: x.nome, funcao: x.funcao ?? null, papel: x.papel, dono: x.papel === 'dono', eu: x.peer === peer, minha: x.minha })),
    membros: membros.map((x) => ({ apelido: x.apelido, nome: x.nome, papel: x.papel, funcao: x.funcao ?? null, online: x.online })),
    silenciados: silenciados.map((x) => ({ apelido: x.apelido, por: x.por ?? null, ate: quando(x.ate), motivo: x.motivo })),
    maos: maos.map((x) => x.apelido),
    silencio: {
      todos: todos ? { motivo: todos.motivo, por: todos.por_nome, desde: quando(todos.criado) } : null,
      setores: globais.filter((g) => g.tipo === 'setor').map((g) => g.alvo),
    },
    ajustes: { gravandoSilencia: m.gravando_silencia, pedirPalavra: m.pedir_palavra, silencioMin: m.silencio_min ?? null },
    sinais: [...chegaram].sort((a, b) => Number(a.id) - Number(b.id)).map((s) => ({ de: s.de_peer, tipo: s.tipo, dados: s.dados })),
    avisos: avisos.map((a) => ({ id: Number(a.id), tipo: a.tipo, de: a.de_nome, setor: a.setor ?? null })),
    ultimoAviso: Number(topo.id),
  })
}

/**
 * POST aviso { diaria, tipo, setor? }: o dono e a Direção mandam para todos ou para um setor; o responsável, só para o
 * setor dele (radio.avisar confere). Gravando para todos silencia o set (menos Direção e Som); Corta reativa.
 */
export async function avisar(tx, p, c) {
  const diaria = String(c?.diaria || '')
  const setor = c?.setor == null ? null : String(c.setor)
  if (!ID.test(diaria) || !TIPOS_AVISO.includes(c?.tipo) || (setor !== null && !FUNCOES.includes(setor))) return r(400, { ok: false })
  const [a] = await tx`select radio.avisar(${diaria}, ${c.tipo}, ${setor}, ${p.nome}) as id`
  if (a?.id == null) return r(403, { ok: false, erro: 'sem_permissao' })
  const [v] = await tx`select setor from radio.avisos where id = ${a.id}`
  return r(201, { ok: true, aviso: { id: Number(a.id), tipo: c.tipo, de: p.nome, setor: v?.setor ?? null } })
}

/**
 * POST moderar { diaria, acao, alvo?, valor?, minutos? } — silenciar e reativar (uma pessoa, o setor ou o set), mover
 * de setor, escolher o responsável, mudar o papel, tirar, pedir e baixar a palavra; e { acao: ajustes, ajustes } e
 * { acao: historico } para o dono. Quem pode o quê: radio.moderar no banco (db/migrations/0001_poderes.sql).
 */
export async function moderar(tx, p, c) {
  const diaria = String(c?.diaria || '')
  if (!ID.test(diaria)) return r(400, { ok: false })
  if (c?.acao === 'ajustes') {
    const a = c.ajustes || {}
    const bool = (v) => (typeof v === 'boolean' ? v : null)
    const min = a.silencioMin == null ? null : Number(a.silencioMin)
    if (min !== null && min !== 5 && min !== 15) return r(400, { ok: false, erro: 'invalido' })
    const [x] = await tx`select radio.ajustar(${diaria}, ${bool(a.gravandoSilencia)}, ${bool(a.pedirPalavra)}, ${min}) as ok`
    return x?.ok ? r(200, { ok: true }) : r(403, { ok: false, erro: 'sem_permissao' })
  }
  if (c?.acao === 'historico') {
    const lista = await tx`select quem_nome, acao, alvo_nome, detalhe, criado from radio.historico where diaria_id = ${diaria} order by id desc limit 100`
    return r(200, { ok: true, historico: lista.map((h) => ({ quem: h.quem_nome, acao: h.acao, alvo: h.alvo_nome ?? null, detalhe: h.detalhe ?? null, quando: new Date(h.criado).toISOString() })) })
  }
  if (!ACOES.includes(c?.acao)) return r(400, { ok: false, erro: 'acao' })
  const alvo = c.alvo == null ? null : String(c.alvo)
  if (alvo !== null && !APELIDO.test(alvo)) return r(400, { ok: false, erro: 'alvo' })
  const valor = c.valor == null ? null : String(c.valor).slice(0, 20)
  const minutos = c.minutos == null ? null : Number(c.minutos)
  if (minutos !== null && ![0, 5, 15].includes(minutos)) return r(400, { ok: false, erro: 'minutos' })
  const [x] = await tx`select radio.moderar(${diaria}, ${c.acao}, ${alvo}, ${valor}, ${minutos}) as resultado`
  const res = x?.resultado
  return res === 'ok' ? r(200, { ok: true }) : r(RECUSA[res] || 400, { ok: false, erro: res || 'invalido' })
}

// ───────── TURN (voz entre redes diferentes) ─────────
// Sem ponte, a voz só fecha quando os aparelhos se alcançam direto (mesma rede, a maioria das redes de casa); em 4G com
// CGNAT não fecha. Com a chave TURN da Cloudflare (CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_API_TOKEN, só no servidor),
// cada pedido ganha credenciais temporárias. A voz segue cifrada de ponta a ponta (DTLS-SRTP): a ponte não ouve.

export const STUN_PADRAO = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
export const TURN_TTL_S = 6 * 3600

/**
 * { iceServers, turn, motivo } para o RTCPeerConnection: com a chave TURN, as credenciais da Cloudflare; sem ela (ou
 * falhando), só STUN. `motivo` diz por que não houve TURN (sem a chave, ID fora do formato, a resposta da Cloudflare),
 * nunca a chave.
 */
export async function pedirIceServers(env, buscar = fetch) {
  const stun = (motivo) => ({ iceServers: STUN_PADRAO, turn: false, motivo })
  const id = String(env?.CLOUDFLARE_TURN_KEY_ID || '')
    .trim()
    .replace(/^["']|["']$/g, '')
  const token = String(env?.CLOUDFLARE_TURN_API_TOKEN || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
  if (!id && !token) return stun('sem_chave')
  if (!id) return stun('falta_o_id')
  if (!token) return stun('falta_o_token')
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return stun('id_fora_do_formato')
  let r
  try {
    r = await buscar(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL_S }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    return stun('cloudflare_fora_do_ar')
  }
  if (!r.ok) return stun(`cloudflare_${r.status}`)
  const corpo = await r.json().catch(() => null)
  const lista = Array.isArray(corpo?.iceServers) ? corpo.iceServers : null
  if (!lista?.length) return stun('cloudflare_sem_lista')
  // sem trickle ICE: a porta 53 (o navegador bloqueia) só atrasaria juntar os candidatos
  const servidores = lista
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length)
  const turn = servidores.some((s) => s.urls.some((u) => u.startsWith('turn')))
  return { iceServers: servidores, turn, motivo: turn ? 'ok' : 'cloudflare_sem_turn' }
}
