// /api/rift/projetos — os projetos da pessoa. GET lista; POST cria; PATCH ?id= muda nome ou cadência (e marca a
// edição); DELETE ?id= apaga. As exportações do projeto ficam (o nome vai junto nelas).
import { CADENCIAS, data, FORMATOS, id, projetoDe, Recusa, rota, texto, umDe } from '../_rift.js'

const CAMPOS = 'id, nome, formato, largura, altura, cadencia, duracao, modelo, tom, exemplo, criado, editado'

export default rota({
  async GET(tx) {
    const linhas = await tx`select ${tx.unsafe(CAMPOS)} from rift.projetos order by editado desc limit 500`
    return { projetos: linhas.map(projetoDe) }
  },
  async POST(tx, { corpo, pessoa }) {
    const formato = umDe(corpo.formato, Object.keys(FORMATOS), 'Formato')
    const [largura, altura] = FORMATOS[formato]
    const duracao = Number(corpo.duracao)
    if (!(duracao > 0 && duracao <= 3600)) throw new Recusa(400, 'Duração de até uma hora.')
    const modelo = corpo.modelo == null ? null : typeof corpo.modelo === 'string' && /^[a-z0-9-]{2,40}$/.test(corpo.modelo) ? corpo.modelo : null
    const tom = Number.isInteger(corpo.tom) && corpo.tom >= 0 && corpo.tom < 360 ? corpo.tom : 20
    const [r] = await tx`
      insert into rift.projetos (user_sub, id, org_id, nome, formato, largura, altura, cadencia, duracao, modelo, tom, exemplo, criado, editado)
      values (${pessoa.sub}, ${id(corpo.id)}, ${pessoa.org}, ${texto(corpo.nome, 80, 'O nome')}, ${formato}, ${largura}, ${altura},
              ${umDe(corpo.cadencia, CADENCIAS, 'Cadência')}, ${duracao}, ${modelo}, ${tom}, ${corpo.exemplo === true},
              ${data(corpo.criado)}, ${data(corpo.editado)})
      returning ${tx.unsafe(CAMPOS)}`
    return { projeto: projetoDe(r) }
  },
  async PATCH(tx, { corpo, q }) {
    const nome = corpo.nome == null ? null : texto(corpo.nome, 80, 'O nome')
    const cadencia = corpo.cadencia == null ? null : umDe(corpo.cadencia, CADENCIAS, 'Cadência')
    const [r] = await tx`
      update rift.projetos set nome = coalesce(${nome}, nome), cadencia = coalesce(${cadencia}, cadencia), editado = now()
      where id = ${id(q.get('id'))} returning ${tx.unsafe(CAMPOS)}`
    if (!r) throw new Recusa(404, 'Projeto não encontrado.')
    return { projeto: projetoDe(r) }
  },
  async DELETE(tx, { q }) {
    const r = await tx`delete from rift.projetos where id = ${id(q.get('id'))} returning id`
    if (!r.length) throw new Recusa(404, 'Projeto não encontrado.')
    return {}
  },
})
