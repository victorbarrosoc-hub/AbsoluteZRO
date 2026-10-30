// /api/relay/painel — o painel na conta (schema `relay`, api/_banco.js). Só com a sessão do Relay; organização e dono
// vêm dela, nunca do pedido. Tudo como a pessoa (papel relay_app, RLS).
//
//   GET                                → { ok, nuvem, equipe, conversoes, projetos, presets } (projetos e presets: os
//                                        da pessoa e os que a equipe liberou)
//   POST   { conversoes: [...] }       → guarda o lote (até 100; o id do aparelho evita repetir) e corta além de 500
//   PUT    { projeto } | { preset }    → cria ou muda (só o que é da pessoa)
//   DELETE ?tipo=projeto|preset&id=…   → apaga (só o que é da pessoa; as conversões do projeto ficam, sem projeto)
//   DELETE ?tipo=historico             → apaga o histórico da pessoa
//
// Sem RELAY_DATABASE_URL: 200 { ok: false, nuvem: false } (o painel segue só no aparelho, sem erro no console).

import { comoPessoa, nuvemLigada } from '../_banco.js'
import { conversaoDaLinha, conversaoDoPedido, HISTORICO_MAX, lerCorpo, LOTE_MAX, mesmaOrigem, pessoaDe, presetDaLinha, presetDoPedido, projetoDaLinha, projetoDoPedido } from '../_painel.js'
import { consulta, json } from '../_zro.js'

export default async function painel(req, res) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE')
    return json(res, 405, { ok: false })
  }
  const pessoa = pessoaDe(req)
  if (!pessoa) return json(res, 401, { ok: false, erro: 'sem sessão' })
  if (!nuvemLigada()) return json(res, 200, { ok: false, nuvem: false })
  if (req.method !== 'GET' && !mesmaOrigem(req)) return json(res, 403, { ok: false })

  try {
    if (req.method === 'GET') return json(res, 200, await ler(pessoa))
    if (req.method === 'POST') return json(res, 200, await guardarConversoes(pessoa, (await lerCorpo(req)).conversoes))
    if (req.method === 'PUT') {
      const corpo = await lerCorpo(req)
      if (corpo.projeto) return json(res, 200, await guardarProjeto(pessoa, corpo.projeto))
      if (corpo.preset) return json(res, 200, await guardarPreset(pessoa, corpo.preset))
      return json(res, 400, { ok: false, erro: 'nada para guardar' })
    }
    const q = consulta(req)
    return json(res, 200, await apagar(pessoa, q.get('tipo'), q.get('id')))
  } catch (e) {
    if (e.status) return json(res, e.status, { ok: false, erro: e.message })
    if (e instanceof SyntaxError) return json(res, 400, { ok: false, erro: 'corpo inválido' })
    // RLS: mexer no que é de outra pessoa (o id de um projeto dela, por exemplo)
    if (e?.code === '42501') return json(res, 403, { ok: false, erro: 'Isto é de outra pessoa.' })
    console.error('relay/painel', e?.code || e?.message)
    return json(res, 503, { ok: false, erro: 'banco fora' })
  }
}

async function ler(pessoa) {
  return comoPessoa(pessoa, async (tx) => {
    const [conversoes, projetos, presets] = await Promise.all([
      tx`select * from relay.conversoes order by quando desc limit ${HISTORICO_MAX}`,
      tx`select * from relay.projetos order by atualizado desc limit 200`,
      tx`select * from relay.presets order by atualizado desc limit 200`,
    ])
    return {
      ok: true,
      nuvem: true,
      equipe: Boolean(pessoa.org),
      conversoes: conversoes.map(conversaoDaLinha),
      projetos: projetos.map((r) => projetoDaLinha(r, pessoa.sub)),
      presets: presets.map((r) => presetDaLinha(r, pessoa.sub)),
    }
  })
}

async function guardarConversoes(pessoa, lista) {
  if (!Array.isArray(lista)) throw Object.assign(new Error('sem conversões'), { status: 400 })
  const linhas = lista.slice(0, LOTE_MAX).map(conversaoDoPedido).filter(Boolean)
  return comoPessoa(pessoa, async (tx) => {
    // projeto que a pessoa não vê (apagado, ou a equipe fechou) não impede guardar: a conversão fica sem projeto
    const pedidos = [...new Set(linhas.map((c) => c.projeto_id).filter(Boolean))]
    const vistos = new Set(pedidos.length ? (await tx`select id from relay.projetos where id in ${tx(pedidos)}`).map((r) => r.id) : [])
    for (const c of linhas)
      await tx`
        insert into relay.conversoes (user_sub, id, quando, projeto_id, origem, entrada, preset, saida, segundos)
        values (${pessoa.sub}, ${c.id}, ${c.quando}, ${vistos.has(c.projeto_id) ? c.projeto_id : null}, ${c.origem},
          ${tx.json(c.entrada)}, ${tx.json(c.preset)}, ${tx.json(c.saida)}, ${c.segundos})
        on conflict (user_sub, id) do nothing`
    await tx`
      delete from relay.conversoes c
      where c.user_sub = ${pessoa.sub}
        and c.id not in (select id from relay.conversoes where user_sub = ${pessoa.sub} order by quando desc limit ${HISTORICO_MAX})`
    return { ok: true, guardadas: linhas.map((c) => c.id), recusadas: lista.length - linhas.length }
  })
}

async function guardarProjeto(pessoa, x) {
  const p = projetoDoPedido(x, pessoa)
  return comoPessoa(pessoa, async (tx) => {
    const [r] = await tx`
      insert into relay.projetos (id, user_sub, org_id, nome, destinos, equipe)
      values (${p.id}, ${pessoa.sub}, ${p.org_id}, ${p.nome}, ${p.destinos}, ${p.equipe})
      on conflict (id) do update set nome = excluded.nome, destinos = excluded.destinos, equipe = excluded.equipe,
        org_id = excluded.org_id, atualizado = now()
      where relay.projetos.user_sub = ${pessoa.sub}
      returning *`
    if (!r) throw Object.assign(new Error('Este projeto é de outra pessoa.'), { status: 403 })
    return { ok: true, projeto: projetoDaLinha(r, pessoa.sub) }
  })
}

async function guardarPreset(pessoa, x) {
  const p = presetDoPedido(x, pessoa)
  return comoPessoa(pessoa, async (tx) => {
    const [r] = await tx`
      insert into relay.presets (user_sub, id, org_id, ficha, equipe)
      values (${pessoa.sub}, ${p.id}, ${p.org_id}, ${tx.json(p.ficha)}, ${p.equipe})
      on conflict (user_sub, id) do update set ficha = excluded.ficha, equipe = excluded.equipe, org_id = excluded.org_id,
        atualizado = now()
      returning *`
    return { ok: true, preset: presetDaLinha(r, pessoa.sub) }
  })
}

async function apagar(pessoa, tipo, id) {
  return comoPessoa(pessoa, async (tx) => {
    if (tipo === 'historico') {
      await tx`delete from relay.conversoes where user_sub = ${pessoa.sub}`
      return { ok: true }
    }
    if (typeof id !== 'string' || id.length > 80) throw Object.assign(new Error('sem id'), { status: 400 })
    if (tipo === 'projeto') {
      const r = await tx`delete from relay.projetos where id = ${id} and user_sub = ${pessoa.sub} returning id`
      return { ok: true, apagado: r.length > 0 }
    }
    if (tipo === 'preset') {
      const r = await tx`delete from relay.presets where id = ${id} and user_sub = ${pessoa.sub} returning id`
      return { ok: true, apagado: r.length > 0 }
    }
    throw Object.assign(new Error('tipo desconhecido'), { status: 400 })
  })
}
