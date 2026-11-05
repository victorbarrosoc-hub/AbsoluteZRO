// POST /api/radio/batida — o aparelho diz que está na diária, manda e recebe os sinais de conexão (WebRTC) e pega os
// avisos de set que perdeu. Chamado a cada ~1 s com a tela aberta. A voz nunca passa por aqui: vai de aparelho para
// aparelho depois que a conexão abre.
//
// Corpo: { diaria, peer, sinais: [{ para, tipo: 'oferta'|'resposta', dados: { sdp } }], aviso: <último id visto> }
// Resposta: { eu, pessoas: [{ peer, nome, funcao, dono, eu }], sinais: [{ de, tipo, dados }], avisos, ultimoAviso }

import { comoPessoa, nuvemLigada } from '../_banco.js'
import { json } from '../_zro.js'
import { lerJson, pessoaDe } from '../_sessao.js'

const ID = /^[a-z0-9]{12}$/
const PEER = /^[a-z0-9]{16,32}$/
/** Online = bateu nos últimos 20 s. */
export const ONLINE_S = 20

export default async function batida(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { ok: false })
  }
  const p = pessoaDe(req)
  if (!p) return json(res, 401, { ok: false, erro: 'sem_sessao' })
  if (!nuvemLigada()) return json(res, 503, { ok: false, erro: 'sem_banco' })
  let c
  try {
    c = await lerJson(req)
  } catch {
    return json(res, 400, { ok: false })
  }
  const diaria = String(c.diaria || '')
  const peer = String(c.peer || '')
  if (!ID.test(diaria) || !PEER.test(peer)) return json(res, 400, { ok: false })
  const saida = (Array.isArray(c.sinais) ? c.sinais : [])
    .slice(0, 20)
    .filter((s) => s && PEER.test(String(s.para || '')) && (s.tipo === 'oferta' || s.tipo === 'resposta') && typeof s.dados?.sdp === 'string' && s.dados.sdp.length <= 12000)
  const ultimo = Number.isSafeInteger(c.aviso) && c.aviso >= 0 ? c.aviso : null

  const r = await comoPessoa(p, async (tx) => {
    const [m] = await tx`select papel, funcao, radio.pode_avisar(${diaria}) as pode from radio.membros where diaria_id = ${diaria} and user_sub = ${p.sub} and radio.membro(${diaria})`
    if (!m) return null
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
      returning id, de_peer, tipo, dados, criado`
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
          select id, tipo, de_nome, criado from radio.avisos
          where diaria_id = ${diaria} and id > ${ultimo} and criado > now() - interval '30 seconds'
          order by id limit 10`
    return { m, chegaram, pessoas, topo: Number(topo.id), avisos }
  })
  if (!r) return json(res, 403, { ok: false, erro: 'fora' })
  return json(res, 200, {
    ok: true,
    eu: { peer, nome: p.nome, funcao: r.m.funcao ?? null, dono: r.m.papel === 'dono', podeAvisar: r.m.pode },
    pessoas: r.pessoas.map((x) => ({ peer: x.peer, nome: x.nome, funcao: x.funcao ?? null, dono: x.papel === 'dono', eu: x.peer === peer, minha: x.minha })),
    sinais: r.chegaram.sort((a, b) => Number(a.id) - Number(b.id)).map((s) => ({ de: s.de_peer, tipo: s.tipo, dados: s.dados })),
    avisos: r.avisos.map((a) => ({ id: Number(a.id), tipo: a.tipo, de: a.de_nome })),
    ultimoAviso: r.topo,
  })
}
