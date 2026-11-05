// /api/radio/diarias — as diárias da pessoa.
//   GET                                    → { diarias: [{ id, codigo, nome, dono, funcao }] }
//   POST { acao: 'criar', nome }           → { diaria }   (quem cria é o dono e pode mandar aviso de set)
//   POST { acao: 'entrar', codigo }        → { diaria }   (QR ou link da ordem do dia; 404 se o código não vale)
//   POST { acao: 'funcao', diaria, funcao } → { ok }      (a função decide o canal da equipe)
// Pessoa da sessão (api/_sessao.js), operação como `radio_app` (RLS).

import { randomInt } from 'node:crypto'
import { comoPessoa, nuvemLigada } from '../_banco.js'
import { json } from '../_zro.js'
import { lerJson, nomeLimpo, pessoaDe } from '../_sessao.js'

export const FUNCOES = ['direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco']
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const sortear = (alfabeto, n) => Array.from({ length: n }, () => alfabeto[randomInt(alfabeto.length)]).join('')
const ID = /^[a-z0-9]{12}$/

const publica = (r) => ({ id: r.id, codigo: r.codigo, nome: r.nome, dono: r.papel === 'dono', funcao: r.funcao ?? null })

async function lerDiaria(tx, sub, id) {
  const [r] = await tx`
    select d.id, d.codigo, d.nome, m.papel, m.funcao from radio.diarias d
    join radio.membros m on m.diaria_id = d.id and m.user_sub = ${sub}
    where d.id = ${id} and d.expira > now()`
  return r ? publica(r) : null
}

export default async function diarias(req, res) {
  const p = pessoaDe(req)
  if (!p) return json(res, 401, { ok: false, erro: 'sem_sessao' })
  if (!nuvemLigada()) return json(res, 503, { ok: false, erro: 'sem_banco' })

  if (req.method === 'GET') {
    const lista = await comoPessoa(p, (tx) => tx`
      select d.id, d.codigo, d.nome, m.papel, m.funcao from radio.membros m
      join radio.diarias d on d.id = m.diaria_id
      where m.user_sub = ${p.sub} and d.expira > now()
      order by m.entrou desc limit 30`)
    return json(res, 200, { ok: true, diarias: lista.map(publica) })
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return json(res, 405, { ok: false })
  }

  let corpo
  try {
    corpo = await lerJson(req)
  } catch {
    return json(res, 400, { ok: false, erro: 'corpo' })
  }

  if (corpo.acao === 'criar') {
    const nome = nomeLimpo(corpo.nome)
    if (!nome) return json(res, 400, { ok: false, erro: 'nome' })
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const id = sortear(MINUSCULAS, 12)
      const codigo = sortear(LETRAS, 6)
      try {
        const d = await comoPessoa(p, async (tx) => {
          await tx`insert into radio.diarias (id, codigo, nome, dono_sub) values (${id}, ${codigo}, ${nome}, ${p.sub})`
          await tx`insert into radio.membros (diaria_id, user_sub, nome, papel, funcao) values (${id}, ${p.sub}, ${p.nome}, 'dono', 'direcao')`
          return lerDiaria(tx, p.sub, id)
        })
        return json(res, 201, { ok: true, diaria: d })
      } catch (e) {
        if (e?.code !== '23505') throw e // código repetido: sorteia de novo
      }
    }
    return json(res, 500, { ok: false, erro: 'codigo' })
  }

  if (corpo.acao === 'entrar') {
    const codigo = String(corpo.codigo || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(codigo)) return json(res, 404, { ok: false, erro: 'codigo' })
    const d = await comoPessoa(p, async (tx) => {
      const [r] = await tx`select radio.entrar(${codigo}, ${p.nome}) as id`
      return r?.id ? lerDiaria(tx, p.sub, r.id) : null
    })
    return d ? json(res, 200, { ok: true, diaria: d }) : json(res, 404, { ok: false, erro: 'codigo' })
  }

  if (corpo.acao === 'funcao') {
    if (!ID.test(String(corpo.diaria || '')) || !FUNCOES.includes(corpo.funcao)) return json(res, 400, { ok: false })
    const n = await comoPessoa(p, (tx) => tx`update radio.membros set funcao = ${corpo.funcao} where diaria_id = ${corpo.diaria} and user_sub = ${p.sub}`)
    return n.count ? json(res, 200, { ok: true }) : json(res, 404, { ok: false })
  }

  return json(res, 400, { ok: false, erro: 'acao' })
}
