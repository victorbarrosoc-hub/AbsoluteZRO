// Predefinições na conta (db/migrations/0002). A biblioteca mora no aparelho; aqui fica a cópia que a pessoa mandou
// guardar e as que ela divide com a equipe. Por `rota()`: sessão do gate, papel foto_app, RLS (a pessoa vê as suas e as
// compartilhadas da organização ativa; só o dono altera e apaga). Contrato em docs/API.md.
//
//   GET    /api/foto/predefinicoes           { minhas, equipe } (sem o json de cada uma)
//   GET    /api/foto/predefinicoes/<id>      uma, com o json
//   PUT    /api/foto/predefinicoes           grava { chave, nome, familia?, json, compartilhada? } (mesma chave = atualiza)
//   PATCH  /api/foto/predefinicoes/<id>      { nome?, familia?, compartilhada? }
//   DELETE /api/foto/predefinicoes/<id>
//
// O vercel.json reescreve /api/foto/predefinicoes/<id> para ?id=<id>.

import { lerBytes } from '../_arquivos.js'
import { UUID } from '../_link.js'
import { rota } from '../_rota.js'
import { pessoaDe } from '../_sessao.js'
import { consulta, json } from '../_zro.js'

export const MAX_JSON = 256 * 1024
const CHAVE = /^[A-Za-z0-9._-]{1,80}$/
const erro = (status, codigo, mais = {}) => ({ status, corpo: { ok: false, erro: codigo, ...mais } })
const nao = erro(404, 'nao_existe')
const limpar = (v) =>
  String(v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const fichaDe = (p, sub) => ({
  id: p.id,
  chave: p.chave,
  nome: p.nome,
  familia: p.familia,
  compartilhada: p.compartilhada,
  minha: p.dono === sub,
  tamanho: p.tamanho,
  criadaEm: p.criada_em,
  atualizadaEm: p.atualizada_em,
})
const COLUNAS = (tx) => tx`id, dono, chave, nome, familia, compartilhada, criada_em, atualizada_em, octet_length(json::text) as tamanho`

/** Nome, família e compartilhada do corpo, conferidos. { campos } ou { campo }. */
function lerCampos(corpo, { criar }) {
  const campos = {}
  if (Object.hasOwn(corpo, 'nome') || criar) {
    const nome = typeof corpo.nome === 'string' && corpo.nome.length <= 400 ? limpar(corpo.nome) : ''
    if (!nome || nome.length > 80) return { campo: 'nome' }
    campos.nome = nome
  }
  if (Object.hasOwn(corpo, 'familia')) {
    const familia = corpo.familia == null ? '' : typeof corpo.familia === 'string' && corpo.familia.length <= 300 ? limpar(corpo.familia) : null
    if (familia === null || familia.length > 60) return { campo: 'familia' }
    campos.familia = familia
  }
  if (Object.hasOwn(corpo, 'compartilhada')) {
    if (typeof corpo.compartilhada !== 'boolean') return { campo: 'compartilhada' }
    campos.compartilhada = corpo.compartilhada
  }
  return { campos }
}

const rotas = rota({
  GET: async (tx, p, _corpo, req) => {
    const id = consulta(req).get('id')
    if (id) {
      if (!UUID.test(id)) return nao
      const [linha] = await tx`select ${COLUNAS(tx)}, json from foto.predefinicoes where id = ${id}`
      return linha ? { status: 200, corpo: { ok: true, predefinicao: { ...fichaDe(linha, p.sub), json: linha.json } } } : nao
    }
    const linhas = await tx`select ${COLUNAS(tx)} from foto.predefinicoes order by lower(familia), lower(nome), id limit 1000`
    const fichas = linhas.map((l) => fichaDe(l, p.sub))
    return { status: 200, corpo: { ok: true, minhas: fichas.filter((f) => f.minha), equipe: fichas.filter((f) => !f.minha) } }
  },
  PUT: async (tx, p, corpo, req) => {
    if (consulta(req).get('id')) return nao
    if (typeof corpo.chave !== 'string' || !CHAVE.test(corpo.chave)) return erro(400, 'campo', { campo: 'chave' })
    const c = lerCampos(corpo, { criar: true })
    if (c.campo) return erro(400, 'campo', { campo: c.campo })
    if (!corpo.json || typeof corpo.json !== 'object' || Array.isArray(corpo.json)) return erro(400, 'campo', { campo: 'json' })
    const texto = JSON.stringify(corpo.json)
    if (Buffer.byteLength(texto) > MAX_JSON) return erro(413, 'grande')
    if (c.campos.compartilhada && !p.org) return erro(409, 'sem_equipe')
    const campos = { familia: '', compartilhada: false, ...c.campos }
    const [linha] = await tx`
      insert into foto.predefinicoes (chave, nome, familia, json, compartilhada)
      values (${corpo.chave}, ${campos.nome}, ${campos.familia}, ${texto}::text::jsonb, ${campos.compartilhada})
      on conflict (dono, chave) do update set nome = excluded.nome, familia = excluded.familia, json = excluded.json, compartilhada = excluded.compartilhada
      returning ${COLUNAS(tx)}`
    return { status: 200, corpo: { ok: true, predefinicao: fichaDe(linha, p.sub) } }
  },
  PATCH: async (tx, p, corpo, req) => {
    const id = consulta(req).get('id')
    if (!id || !UUID.test(id)) return nao
    const c = lerCampos(corpo, { criar: false })
    if (c.campo) return erro(400, 'campo', { campo: c.campo })
    if (!Object.keys(c.campos).length) return erro(400, 'campo', { campo: 'nome' })
    if (c.campos.compartilhada && !p.org) return erro(409, 'sem_equipe')
    // o RLS só deixa alterar a própria: a compartilhada de outra pessoa não muda (404, como se não existisse para alterar)
    const [linha] = await tx`update foto.predefinicoes set ${tx(c.campos)} where id = ${id} returning ${COLUNAS(tx)}`
    return linha ? { status: 200, corpo: { ok: true, predefinicao: fichaDe(linha, p.sub) } } : nao
  },
  DELETE: async (tx, _p, _corpo, req) => {
    const id = consulta(req).get('id')
    if (!id || !UUID.test(id)) return nao
    const r = await tx`delete from foto.predefinicoes where id = ${id} returning id`
    return r.length ? { status: 200, corpo: { ok: true } } : nao
  },
})

export default async function predefinicoes(req, res) {
  try {
    // rota() só lê JSON até 64 KB; a predefinição vai até 256 KB
    if (['PUT', 'PATCH', 'DELETE'].includes(req.method) && pessoaDe(req) && req.body === undefined) {
      const b = await lerBytes(req, MAX_JSON + 16384)
      req.body = b.length ? JSON.parse(b.toString('utf8')) : {}
    }
  } catch (e) {
    return e?.message === 'grande' ? json(res, 413, { ok: false, erro: 'grande' }) : json(res, 400, { ok: false, erro: 'corpo' })
  }
  try {
    return await rotas(req, res)
  } catch (e) {
    const regra = e?.code === 'P0001' && /^predefinicao:([a-z_]+)$/.exec(String(e.message))
    if (regra) return json(res, 409, { ok: false, erro: regra[1] })
    if (e?.code === '23514' || e?.code === '22P02') return json(res, 400, { ok: false, erro: 'campo' })
    throw e
  }
}
