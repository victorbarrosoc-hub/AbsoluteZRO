// Avisos ao fotógrafo: o cliente enviou a escolha da galeria, ou um visitante do evento pediu fotos. Os avisos nascem
// no banco, na mesma transação do fato (db/migrations/0005_avisos.sql, gatilhos em foto.envios e foto.evento_pedidos);
// aqui a pessoa só lê os dela e marca como lido. Por `rota()` (sessão do gate, papel foto_app, RLS). Contrato em
// docs/API.md, "Avisos".
//
//   GET  /api/foto/avisos     os não lidos (até 50, o mais novo primeiro) e quantos são
//   POST /api/foto/avisos     marca como lido: { ids: [id] } | { galeria: id } | { evento: id } | { todos: true }
//
// Sem banco, o GET responde 200 { ok: false, erro: 'sem_banco' } (como /api/foto/saude): a casca consulta sozinha a
// cada minuto e o ponto some sem barulho. O POST segue a regra geral (503).

import { nuvemLigada } from '../_banco.js'
import { UUID } from '../_link.js'
import { rota } from '../_rota.js'
import { pessoaDe } from '../_sessao.js'
import { json } from '../_zro.js'

export const MAX_LISTA = 50
const MAX_IDS = 100

const campo = (nome) => ({ status: 400, corpo: { ok: false, erro: 'campo', campo: nome } })
const contar = async (tx) => (await tx`select count(*)::int as n from foto.avisos where lido_em is null`)[0].n

/** Um aviso como a tela recebe: { id, tipo, em, galeria, evento, nome, quem, fotos }. */
const deLinha = (a) => ({
  id: a.id,
  tipo: a.tipo,
  em: a.criado_em,
  galeria: a.galeria,
  evento: a.evento,
  nome: a.nome,
  quem: a.quem,
  fotos: a.fotos,
})

async function listar(tx) {
  const linhas = await tx`
    select a.id, a.tipo, a.criado_em, a.galeria, a.evento,
           coalesce(g.nome, e.nome) as nome, coalesce(en.nome, p.nome) as quem, coalesce(en.escolhidas, cardinality(p.fotos)) as fotos
      from foto.avisos a
      left join foto.galerias g on g.id = a.galeria
      left join foto.envios en on en.id = a.envio
      left join foto.eventos e on e.id = a.evento
      left join foto.evento_pedidos p on p.id = a.pedido
     where a.lido_em is null
     order by a.criado_em desc, a.id
     limit ${MAX_LISTA}`
  return { status: 200, corpo: { ok: true, avisos: linhas.map(deLinha), naoLidos: await contar(tx) } }
}

async function marcar(tx, _pessoa, corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return campo('ids')
  const chaves = ['ids', 'galeria', 'evento', 'todos'].filter((k) => Object.hasOwn(corpo, k))
  if (chaves.length !== 1) return campo('ids')
  const [k] = chaves
  let feitos
  if (k === 'ids') {
    const ids = corpo.ids
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS || !ids.every((id) => typeof id === 'string' && UUID.test(id))) return campo('ids')
    feitos = await tx`update foto.avisos set lido_em = now() where lido_em is null and id = any(${ids}::uuid[]) returning id`
  } else if (k === 'todos') {
    if (corpo.todos !== true) return campo('todos')
    feitos = await tx`update foto.avisos set lido_em = now() where lido_em is null returning id`
  } else {
    const id = corpo[k]
    if (typeof id !== 'string' || !UUID.test(id)) return campo(k)
    feitos =
      k === 'galeria'
        ? await tx`update foto.avisos set lido_em = now() where lido_em is null and galeria = ${id} returning id`
        : await tx`update foto.avisos set lido_em = now() where lido_em is null and evento = ${id} returning id`
  }
  return { status: 200, corpo: { ok: true, marcados: feitos.length, naoLidos: await contar(tx) } }
}

const porRota = rota({ GET: listar, POST: marcar })

export default async function avisos(req, res) {
  if (req.method === 'GET' && !nuvemLigada() && pessoaDe(req)) return json(res, 200, { ok: false, erro: 'sem_banco' })
  return porRota(req, res)
}
